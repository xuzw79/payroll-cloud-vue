import { Buffer } from "node:buffer";
import net from "node:net";
import tls from "node:tls";

type SocketLike = net.Socket | tls.TLSSocket;

function readLine(socket: SocketLike) {
  return new Promise<string>((resolve, reject) => {
    const onData = (data: Buffer) => {
      cleanup();
      resolve(data.toString("utf8"));
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      socket.off("data", onData);
      socket.off("error", onError);
    };
    socket.once("data", onData);
    socket.once("error", onError);
  });
}

async function writeCommand(socket: SocketLike, command: string) {
  socket.write(`${command}\r\n`);
  return readLine(socket);
}

async function connectSmtp() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  if (!host) throw new Error("SMTP_HOST must be set");

  let socket: SocketLike = port === 465
    ? tls.connect({ host, port, servername: host })
    : net.connect({ host, port });

  await new Promise<void>((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("secureConnect", resolve);
    socket.once("error", reject);
  });
  await readLine(socket);
  await writeCommand(socket, `EHLO ${process.env.SMTP_HELO || "payroll-cloud.local"}`);

  if (port !== 465 && process.env.SMTP_STARTTLS !== "false") {
    await writeCommand(socket, "STARTTLS");
    socket = tls.connect({ socket, servername: host });
    await new Promise<void>((resolve, reject) => {
      socket.once("secureConnect", resolve);
      socket.once("error", reject);
    });
    await writeCommand(socket, `EHLO ${process.env.SMTP_HELO || "payroll-cloud.local"}`);
  }

  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (user && pass) {
    await writeCommand(socket, "AUTH LOGIN");
    await writeCommand(socket, Buffer.from(user).toString("base64"));
    await writeCommand(socket, Buffer.from(pass).toString("base64"));
  }

  return socket;
}

function buildMessage(options: { from: string; to: string; subject: string; text: string; pdf: Buffer; filename: string }) {
  const boundary = `payroll-${Date.now()}`;
  return [
    `From: ${options.from}`,
    `To: ${options.to}`,
    `Subject: ${options.subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    options.text,
    "",
    `--${boundary}`,
    `Content-Type: application/pdf; name="${options.filename}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${options.filename}"`,
    "",
    options.pdf.toString("base64").replace(/(.{76})/g, "$1\r\n"),
    "",
    `--${boundary}--`,
    "."
  ].join("\r\n");
}

export async function sendPayslipMail(options: { to: string; employeeName: string; period: string; pdf: Buffer }) {
  const from = process.env.MAIL_FROM || process.env.SMTP_USER;
  if (!from) throw new Error("MAIL_FROM or SMTP_USER must be set");

  const socket = await connectSmtp();
  try {
    await writeCommand(socket, `MAIL FROM:<${from}>`);
    await writeCommand(socket, `RCPT TO:<${options.to}>`);
    await writeCommand(socket, "DATA");
    socket.write(buildMessage({
      from,
      to: options.to,
      subject: `給与明細 ${options.period}`,
      text: `${options.employeeName} 様\n\n${options.period} の給与明細を添付します。\n`,
      pdf: options.pdf,
      filename: `payslip-${options.period}.pdf`
    }) + "\r\n");
    await readLine(socket);
    await writeCommand(socket, "QUIT");
  } finally {
    socket.end();
  }
}
