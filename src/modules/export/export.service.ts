import { and, eq, isNull } from 'drizzle-orm'
import ExcelJS from 'exceljs'
import { db } from '../../config/database'
import { partnerColumns, partnerValues, partners, pinTypes } from '../../db/schema'
import { AppError } from '../../shared/errors'
import { defineAbilityFor } from '../../shared/permissions'
import type { ExportInput } from './export.schema'

const FIXED_COLUMNS: Record<string, string> = {
  name: 'Nome',
  address: 'Endereço',
  city: 'Cidade',
  state: 'Estado',
  visibility: 'Visibilidade',
  pinType: 'Tipo de Pin',
}

type Requester = { id: string; role: string; tenantId: string }

function neutralizeFormula(value: string): string {
  // Prefixing with ' prevents spreadsheet apps from interpreting as a formula
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
}

function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export const exportService = {
  async getAvailableColumns(requester: Requester) {
    const dynamicCols = await db.query.partnerColumns.findMany({
      where: eq(partnerColumns.tenantId, requester.tenantId),
      orderBy: (c, { asc }) => [asc(c.sortOrder), asc(c.label)],
    })

    const fixed = Object.entries(FIXED_COLUMNS).map(([key, label]) => ({
      key,
      label,
      type: 'fixed' as const,
    }))

    const dynamic = dynamicCols.map(c => ({
      key: c.key,
      label: c.label,
      type: 'dynamic' as const,
    }))

    return { columns: [...fixed, ...dynamic] }
  },

  async generate(input: ExportInput, requester: Requester) {
    const ability = defineAbilityFor({ role: requester.role })
    if (!ability.can('read', 'Partner')) throw new AppError('FORBIDDEN', 403, 'Sem permissão')

    const rows = await db
      .select({
        id: partners.id,
        name: partners.name,
        address: partners.address,
        city: partners.city,
        state: partners.state,
        visibility: partners.visibility,
        pinTypeName: pinTypes.name,
      })
      .from(partners)
      .leftJoin(pinTypes, eq(partners.pinTypeId, pinTypes.id))
      .where(and(eq(partners.tenantId, requester.tenantId), isNull(partners.deletedAt)))

    const dynamicKeys = input.columns.filter(c => !FIXED_COLUMNS[c])
    const dynamicMap = new Map<string, Record<string, string>>()

    if (dynamicKeys.length > 0) {
      const values = await db
        .select({
          partnerId: partnerValues.partnerId,
          key: partnerColumns.key,
          value: partnerValues.value,
        })
        .from(partnerValues)
        .innerJoin(partnerColumns, eq(partnerColumns.id, partnerValues.columnId))
        .where(and(eq(partnerColumns.tenantId, requester.tenantId)))

      for (const v of values) {
        if (!dynamicMap.has(v.partnerId)) dynamicMap.set(v.partnerId, {})
        const entry = dynamicMap.get(v.partnerId)
        if (entry) entry[v.key] = v.value ?? ''
      }
    }

    const headers = input.columns.map(c => FIXED_COLUMNS[c] ?? c)

    const sheetRows = rows.map(partner => {
      const dyn = dynamicMap.get(partner.id) ?? {}
      return input.columns.map(col => {
        if (col === 'pinType') return partner.pinTypeName ?? ''
        if (col in FIXED_COLUMNS) {
          const val = (partner as Record<string, unknown>)[col]
          return val instanceof Date ? val.toISOString().split('T')[0] : String(val ?? '')
        }
        return dyn[col] ?? ''
      })
    })

    if (input.format === 'csv') {
      const lines = [
        headers.map(h => escapeCsvField(neutralizeFormula(h))).join(','),
        ...sheetRows.map(row => row.map(v => escapeCsvField(neutralizeFormula(v))).join(',')),
      ]
      // BOM para compatibilidade com Excel ao abrir CSV
      const buffer = Buffer.concat([
        Buffer.from('﻿', 'utf-8'),
        Buffer.from(lines.join('\r\n'), 'utf-8'),
      ])
      return { buffer, contentType: 'text/csv', extension: 'csv' }
    }

    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Parceiros')
    ws.addRow(headers.map(neutralizeFormula))
    for (const row of sheetRows) {
      ws.addRow(row.map(neutralizeFormula))
    }

    const buffer = Buffer.from(await wb.xlsx.writeBuffer())
    return {
      buffer,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      extension: 'xlsx',
    }
  },
}
