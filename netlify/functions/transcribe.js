// Whisper API 呼び出しプロキシ
// ブラウザから multipart/form-data で音声ファイルを受け取り、OpenAI Whisperに転送する
const Busboy = require("busboy");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  try {
    const { filename, mimeType, fileBuffer } = await parseMultipart(event);
    if (!fileBuffer || fileBuffer.length === 0) {
      return {
        statusCode: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ error: "音声ファイルが受信できませんでした" }),
      };
    }

    // Whisperへ転送するFormDataを組み立て（Node18+のグローバルFormData/Blobを使用）
    const form = new FormData();
    form.append(
      "file",
      new Blob([fileBuffer], { type: mimeType || "application/octet-stream" }),
      filename || "recording.webm"
    );
    form.append("model", "whisper-1");
    form.append("language", "ja");

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form,
    });

    const bodyText = await res.text();
    return {
      statusCode: res.status,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: bodyText,
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "transcribe failed: " + e.message }),
    };
  }
};

// multipart/form-data を busboy でパースして最初のファイルを取り出す
function parseMultipart(event) {
  return new Promise((resolve, reject) => {
    const contentType =
      event.headers["content-type"] || event.headers["Content-Type"];
    if (!contentType) {
      return reject(new Error("Content-Type ヘッダーがありません"));
    }

    const bb = Busboy({ headers: { "content-type": contentType } });
    const result = {};
    const chunks = [];

    bb.on("file", (_name, file, info) => {
      result.filename = info.filename;
      result.mimeType = info.mimeType;
      file.on("data", (d) => chunks.push(d));
    });
    bb.on("error", reject);
    bb.on("close", () => {
      result.fileBuffer = Buffer.concat(chunks);
      resolve(result);
    });

    const body = event.isBase64Encoded
      ? Buffer.from(event.body, "base64")
      : Buffer.from(event.body || "", "binary");
    bb.end(body);
  });
}
