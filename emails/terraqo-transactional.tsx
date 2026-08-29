import React, { type CSSProperties, type ReactNode } from "react";
import { render } from "@react-email/render";
import { terraqoDomains } from "@/lib/terraqo-domains";

const colors = {
  ink: "#0e1a26",
  blue: "#4374ba",
  cyan: "#25c0d5",
  canvas: "#eef3f7",
  muted: "#607083",
  line: "#d8e0ec",
  white: "#ffffff"
};

type EmailFrameProps = {
  preview: string;
  eyebrow: string;
  title: string;
  recipientName?: string | null;
  children: ReactNode;
  footerNote: string;
};

function EmailFrame({ preview, eyebrow, title, recipientName, children, footerNote }: EmailFrameProps) {
  const greeting = recipientName?.trim() ? `Hola, ${recipientName.trim()}.` : "Hola.";
  return (
    <html lang="es">
      <head>
        <meta httpEquiv="Content-Type" content="text/html; charset=UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title}</title>
      </head>
      <body style={bodyStyle}>
        <div style={previewStyle}>{preview}</div>
        <table role="presentation" width="100%" cellPadding="0" cellSpacing="0" style={canvasStyle}>
          <tbody><tr><td align="center" style={{ padding: "32px 16px" }}>
            <table role="presentation" width="100%" cellPadding="0" cellSpacing="0" style={containerStyle}>
              <tbody>
                <tr><td style={brandBarStyle}>
                  <table role="presentation" cellPadding="0" cellSpacing="0"><tbody><tr>
                    <td><img src={`${terraqoDomains.public}/brand/terraqo-3/recurso-9.png`} width="42" height="42" alt="Terraqo" style={logoStyle} /></td>
                    <td style={{ paddingLeft: "12px" }}><strong style={wordmarkStyle}>TERRAQO</strong><span style={brandCaptionStyle}>Portal conectado</span></td>
                  </tr></tbody></table>
                </td></tr>
                <tr><td style={contentStyle}>
                  <p style={eyebrowStyle}>{eyebrow}</p>
                  <h1 style={headingStyle}>{title}</h1>
                  <p style={greetingStyle}>{greeting}</p>
                  {children}
                </td></tr>
                <tr><td style={securityStyle}>
                  <strong style={{ color: colors.ink }}>Seguridad Terraqo</strong>
                  <p style={{ margin: "6px 0 0", color: colors.muted, fontSize: "13px", lineHeight: "20px" }}>{footerNote}</p>
                </td></tr>
                <tr><td style={footerStyle}>
                  <p style={{ margin: 0 }}>Este es un mensaje transaccional enviado por Terraqo.</p>
                  <p style={{ margin: "8px 0 0" }}><a href={`${terraqoDomains.public}/privacidad`} style={footerLinkStyle}>Privacidad</a><span style={{ margin: "0 8px" }}>·</span><a href={terraqoDomains.portal} style={footerLinkStyle}>Portal Terraqo</a></p>
                  <p style={{ margin: "8px 0 0" }}>© {new Date().getFullYear()} Terraqo. El trabajo habla por ti.</p>
                </td></tr>
              </tbody>
            </table>
          </td></tr></tbody>
        </table>
      </body>
    </html>
  );
}

export function EmailVerificationLinkTemplate({ recipientName, verificationUrl }: { recipientName?: string | null; verificationUrl: string }) {
  return (
    <EmailFrame preview="Confirma tu correo para activar tu cuenta Terraqo." eyebrow="Acceso seguro" title="Confirma tu cuenta" recipientName={recipientName} footerNote="El enlace es personal, vence en 24 horas y solo puede utilizarse para la cuenta asociada a este correo.">
      <p style={paragraphStyle}>Tu cuenta ya fue creada. Confirma este correo para entrar al Portal Terraqo y completar tu perfil.</p>
      <table role="presentation" cellPadding="0" cellSpacing="0" style={{ margin: "28px 0" }}><tbody><tr><td style={buttonCellStyle}><a href={verificationUrl} style={buttonLinkStyle}>Verificar mi cuenta&nbsp;&nbsp;→</a></td></tr></tbody></table>
      <p style={helperStyle}>Si el botón no funciona, copia y pega este enlace en tu navegador:</p>
      <p style={urlBoxStyle}><a href={verificationUrl} style={urlLinkStyle}>{verificationUrl}</a></p>
      <p style={paragraphStyle}>Después de verificarlo, inicia sesión para completar tu identidad, experiencia y preferencias.</p>
    </EmailFrame>
  );
}

export function EmailVerificationCodeTemplate({ recipientName, code }: { recipientName?: string | null; code: string }) {
  return (
    <EmailFrame preview="Tu código de verificación Terraqo está listo." eyebrow="Confirmación de identidad" title="Verifica tu correo" recipientName={recipientName} footerNote="El código vence en 15 minutos. Terraqo nunca te pedirá que lo compartas por llamada, chat o mensajería.">
      <p style={paragraphStyle}>Usa este código para confirmar tu correo y continuar con el acceso a tu cuenta:</p>
      <div style={codeStyle}>{code}</div>
      <p style={paragraphStyle}>Ingresa el código exactamente como aparece. Si no solicitaste este acceso, puedes ignorar el mensaje.</p>
    </EmailFrame>
  );
}

export async function renderVerificationLinkEmail(input: { recipientName?: string | null; verificationUrl: string }) {
  const element = <EmailVerificationLinkTemplate {...input} />;
  return { html: await render(element), text: await render(element, { plainText: true }) };
}

export async function renderVerificationCodeEmail(input: { recipientName?: string | null; code: string }) {
  const element = <EmailVerificationCodeTemplate {...input} />;
  return { html: await render(element), text: await render(element, { plainText: true }) };
}

export function ProfileCompletionTemplate({ recipientName, profileUrl, customMessage, emailVerified, hasUsername }: { recipientName?: string | null; profileUrl: string; customMessage?: string | null; emailVerified: boolean; hasUsername: boolean }) {
  const helpUrl = "https://wa.me/51926912607?text=Necesito%20ayuda%20con%20mi%20cuenta%20de%20Terraqo";
  return (
    <EmailFrame preview="Completa tu perfil Terraqo y convierte tu experiencia en oportunidades." eyebrow="Tu perfil profesional" title="Haz que tu trabajo hable por ti" recipientName={recipientName} footerNote="Terraqo sólo muestra la información que decides publicar. Las empresas vinculadas acceden únicamente a los datos autorizados para su workspace.">
      {customMessage ? <p style={{ ...paragraphStyle, padding: "14px 16px", backgroundColor: "#f4f7fa", borderLeft: `3px solid ${colors.cyan}` }}>{customMessage}</p> : null}
      <p style={paragraphStyle}>Tu perfil puede convertirse en un CV vivo respaldado por experiencias, proyectos y evidencia real de trabajo.</p>
      <table role="presentation" width="100%" cellPadding="0" cellSpacing="0" style={{ margin: "22px 0", border: `1px solid ${colors.line}`, borderRadius: "10px", backgroundColor: "#f8fbfd" }}><tbody>
        <tr><td style={{ padding: "18px" }}><strong style={{ color: colors.ink }}>Vista previa de tu perfil público</strong><p style={{ margin: "8px 0 0", color: colors.muted, fontSize: "14px", lineHeight: "21px" }}>{recipientName || "Tu nombre profesional"}<br />Experiencia, capacidades, proyectos y bitácoras verificables.</p></td></tr>
      </tbody></table>
      <p style={paragraphStyle}><strong>Próximos pasos:</strong></p>
      <ul style={{ margin: "0 0 22px", paddingLeft: "22px", color: "#35485b", fontSize: "15px", lineHeight: "25px" }}>
        <li>{emailVerified ? "Tu correo ya está verificado." : "Verifica tu correo para proteger y activar completamente tu cuenta."}</li>
        <li>{hasUsername ? "Tu nombre de usuario ya está creado; revisa que represente tu marca profesional." : "Crea tu nombre de usuario para obtener un enlace público fácil de compartir."}</li>
        <li>Completa la mayor cantidad posible de información profesional.</li>
        <li>Registra bitácoras con avances, fotos y resultados para sumar valor a tu CV.</li>
      </ul>
      <table role="presentation" cellPadding="0" cellSpacing="0" style={{ margin: "26px 0" }}><tbody><tr><td style={buttonCellStyle}><a href={profileUrl} style={buttonLinkStyle}>{emailVerified ? "Completar mi perfil" : "Verificar correo y continuar"}&nbsp;&nbsp;→</a></td></tr></tbody></table>
      <p style={helperStyle}>¿Necesitas ayuda? Escríbenos al <a href={helpUrl} style={urlLinkStyle}>926 912 607</a> con el asunto: <strong>Necesito ayuda con mi cuenta de Terraqo</strong>.</p>
    </EmailFrame>
  );
}

export async function renderProfileCompletionEmail(input: { recipientName?: string | null; profileUrl: string; customMessage?: string | null; emailVerified: boolean; hasUsername: boolean }) {
  const element = <ProfileCompletionTemplate {...input} />;
  return { html: await render(element), text: await render(element, { plainText: true }) };
}

const bodyStyle: CSSProperties = { margin: 0, padding: 0, backgroundColor: colors.canvas, fontFamily: "Arial, Helvetica, sans-serif", color: colors.ink };
const previewStyle: CSSProperties = { display: "none", maxHeight: 0, overflow: "hidden", opacity: 0, color: "transparent", lineHeight: "1px", fontSize: "1px" };
const canvasStyle: CSSProperties = { width: "100%", backgroundColor: colors.canvas, borderCollapse: "collapse" };
const containerStyle: CSSProperties = { width: "100%", maxWidth: "620px", backgroundColor: colors.white, border: `1px solid ${colors.line}`, borderRadius: "16px", overflow: "hidden", boxShadow: "0 18px 50px rgba(14,26,38,0.08)", borderCollapse: "separate" };
const brandBarStyle: CSSProperties = { padding: "22px 28px", backgroundColor: colors.ink, borderBottom: `3px solid ${colors.cyan}` };
const logoStyle: CSSProperties = { display: "block", width: "42px", height: "42px", borderRadius: "9px", backgroundColor: colors.white };
const wordmarkStyle: CSSProperties = { display: "block", color: colors.white, fontSize: "18px", letterSpacing: "3px", lineHeight: "22px" };
const brandCaptionStyle: CSSProperties = { display: "block", color: "#a9bed2", fontSize: "11px", letterSpacing: "1.2px", textTransform: "uppercase", marginTop: "3px" };
const contentStyle: CSSProperties = { padding: "42px 40px 34px" };
const eyebrowStyle: CSSProperties = { margin: "0 0 12px", color: colors.blue, fontSize: "12px", lineHeight: "18px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.8px" };
const headingStyle: CSSProperties = { margin: "0 0 20px", color: colors.ink, fontSize: "34px", lineHeight: "40px", letterSpacing: "-0.8px" };
const greetingStyle: CSSProperties = { margin: "0 0 14px", color: colors.ink, fontSize: "16px", lineHeight: "25px", fontWeight: 700 };
const paragraphStyle: CSSProperties = { margin: "0 0 16px", color: "#35485b", fontSize: "16px", lineHeight: "26px" };
const buttonCellStyle: CSSProperties = { borderRadius: "9px", backgroundColor: colors.blue };
const buttonLinkStyle: CSSProperties = { display: "inline-block", padding: "15px 24px", color: colors.white, fontSize: "15px", lineHeight: "20px", fontWeight: 700, textDecoration: "none" };
const helperStyle: CSSProperties = { margin: "0 0 8px", color: colors.muted, fontSize: "13px", lineHeight: "20px" };
const urlBoxStyle: CSSProperties = { margin: "0 0 24px", padding: "12px 14px", borderRadius: "8px", backgroundColor: "#f4f7fa", border: `1px solid ${colors.line}`, overflowWrap: "anywhere" };
const urlLinkStyle: CSSProperties = { color: colors.blue, fontSize: "12px", lineHeight: "18px", textDecoration: "underline" };
const codeStyle: CSSProperties = { margin: "26px 0", padding: "22px", borderRadius: "10px", border: `1px solid ${colors.line}`, backgroundColor: "#f4f7fa", color: colors.ink, fontSize: "34px", lineHeight: "40px", fontWeight: 800, letterSpacing: "10px", textAlign: "center" };
const securityStyle: CSSProperties = { padding: "20px 40px", backgroundColor: "#f7fafc", borderTop: `1px solid ${colors.line}`, borderBottom: `1px solid ${colors.line}`, fontSize: "13px" };
const footerStyle: CSSProperties = { padding: "24px 40px 30px", color: "#7b8795", fontSize: "12px", lineHeight: "18px", textAlign: "center" };
const footerLinkStyle: CSSProperties = { color: colors.blue, textDecoration: "underline" };
