import { Buffer } from "node:buffer";
import net from "node:net";
import tls from "node:tls";

type SocketLike = net.Socket | tls.TLSSocket;

function encodeHeader(value: string) {
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function envelopeAddress(value: string) {
  const matched = value.match(/<([^>]+)>/);
  return (matched?.[1] || value).trim();
}

function readResponse(socket: SocketLike) {
  return new Promise<string>((resolve, reject) => {
    let buffer = "";
    const onData = (data: Buffer) => {
      buffer += data.toString("utf8");
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const last = lines.at(-1);
      if (last && /^\d{3}\s/.test(last)) {
        cleanup();
        resolve(lines.join("\n"));
      }
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      socket.off("data", onData);
      socket.off("error", onError);
    };
    socket.on("data", onData);
    socket.once("error", onError);
  });
}

function assertCode(response: string, expected: number[]) {
  const code = Number(response.slice(0, 3));
  if (!expected.includes(code)) {
    throw new Error(`SMTP error ${code}: ${response.replace(/\s+/g, " ")}`);
  }
}

async function command(socket: SocketLike, value: string, expected: number[]) {
  socket.write(`${value}\r\n`);
  const response = await readResponse(socket);
  assertCode(response, expected);
  return response;
}

async function connectSmtp() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  if (!host) throw new Error("SMTP_HOST must be set");

  let socket: SocketLike = port === 465
    ? tls.connect({ host, port, servername: host })
    : net.connect({ host, port });

  await new Promise<void>((resolve, reject) => {
    socket.once(port === 465 ? "secureConnect" : "connect", resolve);
    socket.once("error", reject);
  });
  assertCode(await readResponse(socket), [220]);

  await command(socket, `EHLO ${process.env.SMTP_HELO || "iwills.co.jp"}`, [250]);

  if (port !== 465 && process.env.SMTP_STARTTLS !== "false") {
    await command(socket, "STARTTLS", [220]);
    socket = tls.connect({ socket, servername: host });
    await new Promise<void>((resolve, reject) => {
      socket.once("secureConnect", resolve);
      socket.once("error", reject);
    });
    await command(socket, `EHLO ${process.env.SMTP_HELO || "iwills.co.jp"}`, [250]);
  }

  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (user && pass) {
    await command(socket, "AUTH LOGIN", [334]);
    await command(socket, Buffer.from(user).toString("base64"), [334]);
    await command(socket, Buffer.from(pass).toString("base64"), [235]);
  }

  return socket;
}

function buildMessage(options: { from: string; to: string; subject: string; text: string; pdf: Buffer; filename: string }) {
  const boundary = `payroll-${Date.now()}`;
  return [
    `From: ${options.from}`,
    `To: ${options.to}`,
    `Subject: ${encodeHeader(options.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(options.text, "utf8").toString("base64").replace(/(.{76})/g, "$1\r\n"),
    "",
    `--${boundary}`,
    `Content-Type: application/pdf; name="${options.filename}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${options.filename}"`,
    "",
    options.pdf.toString("base64").replace(/(.{76})/g, "$1\r\n"),
    "",
    `--${boundary}--`
  ].join("\r\n");
}

export async function sendPayslipMail(options: { to: string; employeeName: string; period: string; pdf: Buffer }) {
  const from = process.env.MAIL_FROM || process.env.SMTP_USER;
  if (!from) throw new Error("MAIL_FROM or SMTP_USER must be set");

  const socket = await connectSmtp();
  try {
    await command(socket, `MAIL FROM:<${envelopeAddress(from)}>`, [250]);
    await command(socket, `RCPT TO:<${envelopeAddress(options.to)}>`, [250, 251]);
    await command(socket, "DATA", [354]);
    socket.write(buildMessage({
      from,
      to: options.to,
      subject: `給与明細 ${options.period}`,
      text: `${options.employeeName} 様\n\n${options.period} の給与明細を添付します。\n`,
      pdf: options.pdf,
      filename: `payslip-${options.period}.pdf`
    }) + "\r\n.\r\n");
    assertCode(await readResponse(socket), [250]);
    await command(socket, "QUIT", [221]);
  } finally {
    socket.end();
  }
}
