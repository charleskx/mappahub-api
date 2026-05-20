import nodemailer from 'nodemailer'
import { env } from '../config/env'

interface MailOptions {
  to: string
  subject: string
  html: string
}

function createTransport() {
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  })
}

export async function sendMail(options: MailOptions): Promise<void> {
  if (env.NODE_ENV !== 'production') {
    console.log('\n📧 [MAILER DEV]')
    console.log(`  To: ${options.to}`)
    console.log(`  Subject: ${options.subject}\n`)
    return
  }

  const transport = createTransport()
  await transport.sendMail({
    from: env.SMTP_FROM,
    to: options.to,
    subject: options.subject,
    html: options.html,
  })
}

// ─── Base layout ─────────────────────────────────────────────────────────────

function baseTemplate(opts: {
  previewText?: string
  headerColor?: string
  headerIcon?: string
  title: string
  body: string
  appUrl: string
}): string {
  const {
    previewText = '',
    headerColor = '#6366f1',
    headerIcon = '',
    title,
    body,
    appUrl,
  } = opts

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${title}</title>
  <!--[if mso]><style>td,th,div,p,a{font-family:Segoe UI,Arial,sans-serif}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased">
  ${previewText ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${previewText}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>` : ''}

  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#f1f5f9">
    <tr>
      <td align="center" style="padding:40px 16px">

        <!-- Wrapper -->
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px">

          <!-- Logotipo -->
          <tr>
            <td align="center" style="padding-bottom:28px">
              <a href="${appUrl}" style="text-decoration:none;display:inline-block">
                <span style="font-size:24px;font-weight:800;color:#1e1b4b;letter-spacing:-0.5px;line-height:1">MappaHub<span style="color:#6366f1">.</span></span>
              </a>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.07)">

              <!-- Header colorido -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="background:${headerColor};padding:32px 40px 28px;text-align:center">
                    ${headerIcon ? `<div style="font-size:40px;margin-bottom:12px;line-height:1">${headerIcon}</div>` : ''}
                    <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;line-height:1.3;letter-spacing:-0.3px">${title}</h1>
                  </td>
                </tr>
              </table>

              <!-- Conteúdo -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="padding:36px 40px 40px">
                    ${body}
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Divider -->
          <tr><td style="height:28px"></td></tr>

          <!-- Footer -->
          <tr>
            <td style="text-align:center;padding:0 20px 8px">
              <p style="margin:0 0 8px;font-size:12px;color:#94a3b8;line-height:1.6">
                Este e-mail foi enviado automaticamente pela plataforma <strong>MappaHub</strong>.<br>
                Não responda a este endereço de e-mail.
              </p>
              <p style="margin:0;font-size:12px;color:#cbd5e1">
                <a href="${appUrl}" style="color:#6366f1;text-decoration:none;font-weight:500">app.atlasync.com.br</a>
                &nbsp;·&nbsp;
                <span>© ${new Date().getFullYear()} MappaHub</span>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ctaButton(label: string, href: string, color = '#6366f1'): string {
  return `
  <table cellpadding="0" cellspacing="0" role="presentation" style="margin:24px auto 0">
    <tr>
      <td style="border-radius:10px;background:${color}">
        <a href="${href}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;letter-spacing:-0.1px;border-radius:10px;line-height:1">${label}</a>
      </td>
    </tr>
  </table>
  <p style="margin:16px 0 0;text-align:center;font-size:12px;color:#94a3b8">
    Ou copie e cole este link no seu navegador:<br>
    <a href="${href}" style="color:#6366f1;text-decoration:none;word-break:break-all">${href}</a>
  </p>`
}

function infoRow(label: string, value: string, bg = '#f8fafc'): string {
  return `
  <tr>
    <td style="padding:10px 16px;background:${bg};font-size:13px;color:#64748b;font-weight:500;border-bottom:1px solid #f1f5f9;width:40%">${label}</td>
    <td style="padding:10px 16px;background:${bg};font-size:13px;color:#1e293b;font-weight:500;border-bottom:1px solid #f1f5f9">${value}</td>
  </tr>`
}

function paragraph(text: string): string {
  return `<p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7">${text}</p>`
}

function highlight(text: string): string {
  return `<strong style="color:#1e293b">${text}</strong>`
}

// ─── Templates ────────────────────────────────────────────────────────────────

export function verifyEmailHtml(token: string, appUrl: string): string {
  const link = `${appUrl}/verify-email?token=${token}`

  const body = `
    ${paragraph(`Obrigado por se cadastrar no <strong>MappaHub</strong>! Para ativar sua conta, confirme seu endereço de e-mail clicando no botão abaixo.`)}
    ${ctaButton('Verificar meu e-mail', link)}
    <p style="margin:32px 0 0;padding:16px;background:#fef9c3;border-radius:8px;font-size:13px;color:#713f12;line-height:1.6;border:1px solid #fde68a">
      ⏱ Este link é válido por <strong>24 horas</strong>. Se você não criou uma conta no MappaHub, ignore este e-mail com segurança.
    </p>
  `

  return baseTemplate({
    previewText: 'Confirme seu e-mail para ativar sua conta MappaHub',
    headerColor: '#6366f1',
    headerIcon: '✉️',
    title: 'Confirme seu e-mail',
    body,
    appUrl,
  })
}

export function resetPasswordHtml(token: string, appUrl: string): string {
  const link = `${appUrl}/reset-password?token=${token}`

  const body = `
    ${paragraph('Recebemos uma solicitação para redefinir a senha da sua conta MappaHub. Clique no botão abaixo para criar uma nova senha.')}
    ${ctaButton('Redefinir minha senha', link, '#dc2626')}
    <p style="margin:32px 0 0;padding:16px;background:#fef2f2;border-radius:8px;font-size:13px;color:#7f1d1d;line-height:1.6;border:1px solid #fecaca">
      ⏱ Este link expira em <strong>1 hora</strong>. Se você não solicitou a redefinição de senha, ignore este e-mail — sua conta permanece segura.
    </p>
  `

  return baseTemplate({
    previewText: 'Redefina sua senha do MappaHub',
    headerColor: '#dc2626',
    headerIcon: '🔐',
    title: 'Redefinição de senha',
    body,
    appUrl,
  })
}

export function inviteEmailHtml(inviterName: string, token: string, appUrl: string): string {
  const link = `${appUrl}/auth/accept-invite?token=${token}`

  const body = `
    ${paragraph(`${highlight(inviterName)} convidou você para colaborar no <strong>MappaHub</strong>, a plataforma de gestão de parceiros e mapas geográficos.`)}
    ${paragraph('Clique no botão abaixo para aceitar o convite, definir sua senha e começar a usar a plataforma.')}
    ${ctaButton('Aceitar convite', link)}
    <p style="margin:32px 0 0;padding:16px;background:#fef9c3;border-radius:8px;font-size:13px;color:#713f12;line-height:1.6;border:1px solid #fde68a">
      ⏱ Este convite é válido por <strong>7 dias</strong>. Após esse prazo, solicite um novo convite ao administrador da sua organização.
    </p>
  `

  return baseTemplate({
    previewText: `${inviterName} convidou você para o MappaHub`,
    headerColor: '#0891b2',
    headerIcon: '🤝',
    title: 'Você foi convidado!',
    body,
    appUrl,
  })
}

export function trialExpiringHtml(tenantName: string, daysLeft: number, appUrl: string): string {
  const link = `${appUrl}/billing`
  const dayLabel = daysLeft === 1 ? 'dia' : 'dias'
  const isUrgent = daysLeft <= 3

  const body = `
    ${paragraph(`Olá, ${highlight(tenantName)}!`)}
    ${paragraph(`Seu período de avaliação gratuita do MappaHub termina em ${highlight(`${daysLeft} ${dayLabel}`)}. Não perca o acesso às suas funcionalidades!`)}

    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:20px 0;border-radius:10px;overflow:hidden;border:1px solid #e2e8f0">
      <tr>
        <td style="padding:20px;background:#f8fafc">
          <p style="margin:0 0 6px;font-size:12px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em">Progresso do período de avaliação</p>
          <div style="background:#e2e8f0;border-radius:99px;height:8px;overflow:hidden;margin-bottom:8px">
            <div style="background:${isUrgent ? '#dc2626' : '#6366f1'};height:8px;width:${Math.round(((14 - daysLeft) / 14) * 100)}%;border-radius:99px"></div>
          </div>
          <p style="margin:0;font-size:13px;color:${isUrgent ? '#dc2626' : '#64748b'};font-weight:${isUrgent ? '600' : '400'}">
            ${isUrgent ? `⚠️ Apenas ${daysLeft} ${dayLabel} restante${daysLeft > 1 ? 's' : ''}!` : `${daysLeft} ${dayLabel} restantes do seu trial`}
          </p>
        </td>
      </tr>
    </table>

    ${paragraph('Assine um plano para manter acesso a todos os recursos sem interrupção.')}
    ${ctaButton('Ver planos e assinar', link, isUrgent ? '#dc2626' : '#6366f1')}
    <p style="margin:24px 0 0;font-size:13px;color:#94a3b8;text-align:center">
      Dúvidas? Fale com nossa equipe pelo suporte dentro da plataforma.
    </p>
  `

  return baseTemplate({
    previewText: `Seu trial MappaHub expira em ${daysLeft} ${dayLabel}`,
    headerColor: isUrgent ? '#dc2626' : '#f59e0b',
    headerIcon: isUrgent ? '⚠️' : '⏳',
    title: `Trial expira em ${daysLeft} ${dayLabel}`,
    body,
    appUrl,
  })
}

export function importDoneHtml(opts: {
  uploaderName: string
  fileName: string
  totalRows: number
  created: number
  updated: number
  removed: number
  failed: number
  appUrl: string
}): string {
  const { uploaderName, fileName, totalRows, created, updated, removed, failed, appUrl } = opts
  const link = `${appUrl}/import`
  const hasErrors = failed > 0
  const modeLabel = removed > 0 ? 'Substituição total' : 'Incremental'

  const body = `
    ${paragraph(`A importação do arquivo ${highlight(fileName)}, iniciada por ${highlight(uploaderName)}, foi <strong style="color:#16a34a">concluída com sucesso</strong>!`)}

    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;margin:20px 0">
      <tbody>
        ${infoRow('📄 Arquivo', fileName)}
        ${infoRow('📊 Total de linhas', totalRows.toLocaleString('pt-BR'), '#ffffff')}
        ${infoRow('✅ Criados', `<strong style="color:#16a34a">${created.toLocaleString('pt-BR')}</strong>`)}
        ${infoRow('🔄 Atualizados', updated.toLocaleString('pt-BR'), '#ffffff')}
        ${removed > 0 ? infoRow('🗑️ Removidos', `<strong style="color:#dc2626">${removed.toLocaleString('pt-BR')}</strong>`) : ''}
        ${hasErrors ? infoRow('⚠️ Erros', `<strong style="color:#f59e0b">${failed.toLocaleString('pt-BR')}</strong>`, '#ffffff') : ''}
        ${infoRow('⚙️ Modo', modeLabel, removed > 0 || !hasErrors ? '#f8fafc' : '#ffffff')}
      </tbody>
    </table>

    ${hasErrors ? `<p style="margin:0 0 16px;padding:14px 16px;background:#fef9c3;border-radius:8px;font-size:13px;color:#713f12;line-height:1.6;border:1px solid #fde68a">⚠️ ${failed} linha${failed > 1 ? 's' : ''} não pôde${failed > 1 ? 'ram' : ''} ser importada${failed > 1 ? 's' : ''}. Acesse a plataforma para ver os detalhes dos erros.</p>` : ''}

    ${ctaButton('Ver detalhes da importação', link)}
  `

  return baseTemplate({
    previewText: `Importação de ${fileName} concluída — ${created} criados, ${updated} atualizados`,
    headerColor: hasErrors ? '#f59e0b' : '#16a34a',
    headerIcon: hasErrors ? '⚠️' : '✅',
    title: hasErrors ? 'Importação concluída com avisos' : 'Importação concluída!',
    body,
    appUrl,
  })
}

export function ticketReplyHtml(opts: {
  recipientName: string
  ticketTitle: string
  replyBody: string
  status: string
  appUrl: string
}): string {
  const { recipientName, ticketTitle, replyBody, status, appUrl } = opts
  const link = `${appUrl}/support`

  const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
    open: { label: 'Aberto', color: '#92400e', bg: '#fef3c7' },
    in_progress: { label: 'Em andamento', color: '#1e40af', bg: '#dbeafe' },
    resolved: { label: 'Resolvido', color: '#14532d', bg: '#dcfce7' },
  }
  const sc = statusConfig[status] ?? { label: status, color: '#374151', bg: '#f3f4f6' }

  const body = `
    ${paragraph(`Olá, ${highlight(recipientName)}!`)}
    ${paragraph('Sua solicitação de suporte recebeu uma nova resposta da equipe MappaHub.')}

    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;margin:20px 0">
      <tbody>
        ${infoRow('🎫 Ticket', ticketTitle)}
        ${infoRow('📌 Status', `<span style="display:inline-block;padding:2px 10px;border-radius:99px;font-size:12px;font-weight:600;color:${sc.color};background:${sc.bg}">${sc.label}</span>`, '#ffffff')}
      </tbody>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 8px">
      <tr>
        <td>
          <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em">Resposta da equipe MappaHub</p>
          <div style="border-left:3px solid #6366f1;padding:14px 18px;background:#f8f7ff;border-radius:0 8px 8px 0">
            <p style="margin:0;font-size:14px;color:#374151;line-height:1.7;white-space:pre-wrap">${replyBody.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
          </div>
        </td>
      </tr>
    </table>

    ${ctaButton('Ver ticket completo', link)}
  `

  return baseTemplate({
    previewText: `Nova resposta no ticket: ${ticketTitle}`,
    headerColor: '#6366f1',
    headerIcon: '💬',
    title: 'Nova resposta no seu ticket',
    body,
    appUrl,
  })
}

export function ticketResolvedHtml(opts: {
  recipientName: string
  ticketTitle: string
  appUrl: string
}): string {
  const { recipientName, ticketTitle, appUrl } = opts
  const link = `${appUrl}/support`

  const body = `
    ${paragraph(`Olá, ${highlight(recipientName)}!`)}
    ${paragraph(`O ticket abaixo foi marcado como ${highlight('resolvido')} pela equipe MappaHub. Esperamos que seu problema tenha sido solucionado!`)}

    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;margin:20px 0">
      <tbody>
        ${infoRow('🎫 Ticket', ticketTitle)}
        ${infoRow('📌 Status', `<span style="display:inline-block;padding:2px 10px;border-radius:99px;font-size:12px;font-weight:600;color:#14532d;background:#dcfce7">✓ Resolvido</span>`, '#ffffff')}
      </tbody>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:20px 0">
      <tr>
        <td style="padding:18px;background:#f0fdf4;border-radius:10px;border:1px solid #bbf7d0;text-align:center">
          <p style="margin:0;font-size:14px;color:#15803d;line-height:1.6">
            O problema não foi resolvido? Você pode abrir um novo ticket<br>a qualquer momento diretamente pela plataforma.
          </p>
        </td>
      </tr>
    </table>

    ${ctaButton('Ver meus tickets', link, '#16a34a')}
  `

  return baseTemplate({
    previewText: `Seu ticket foi resolvido: ${ticketTitle}`,
    headerColor: '#16a34a',
    headerIcon: '✅',
    title: 'Ticket resolvido!',
    body,
    appUrl,
  })
}

export function newTicketNotificationHtml(opts: {
  ticketTitle: string
  ticketBody: string
  senderName: string
  tenantName: string
  appUrl: string
}): string {
  const { ticketTitle, ticketBody, senderName, tenantName, appUrl } = opts
  const link = `${appUrl}/support`

  const body = `
    ${paragraph(`Um novo ticket de suporte foi aberto por ${highlight(senderName)} da empresa ${highlight(tenantName)}.`)}

    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;margin:20px 0">
      <tbody>
        ${infoRow('🎫 Assunto', ticketTitle)}
        ${infoRow('👤 Solicitante', senderName, '#ffffff')}
        ${infoRow('🏢 Empresa', tenantName)}
      </tbody>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 8px">
      <tr>
        <td>
          <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em">Descrição</p>
          <div style="border-left:3px solid #e2e8f0;padding:14px 18px;background:#f8fafc;border-radius:0 8px 8px 0">
            <p style="margin:0;font-size:14px;color:#374151;line-height:1.7;white-space:pre-wrap">${ticketBody.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
          </div>
        </td>
      </tr>
    </table>

    ${ctaButton('Responder ticket', link)}
  `

  return baseTemplate({
    previewText: `Novo ticket: ${ticketTitle} — ${senderName} (${tenantName})`,
    headerColor: '#7c3aed',
    headerIcon: '🎫',
    title: 'Novo ticket de suporte',
    body,
    appUrl,
  })
}
