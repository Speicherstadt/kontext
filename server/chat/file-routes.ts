/**
 * /api/chat files: uploading a photo, file or voice message into a channel, and reading it back
 * (with byte ranges for audio). Mounted by routes.ts behind its sign-in check.
 */
import { Hono } from "hono";
import { limitBody } from "../body-limit";
import type { SessionAccount } from "../categories/routes";
import {
  canSee,
  INLINE_TYPES,
  isVoice,
  looksSealed,
  MAIL_COPY_TYPE,
  MAX_FILE_BYTES,
  NOT_SEALED,
  SEALED_FILE_TYPE,
  type Viewer,
  voiceType,
} from "./chat";
import type { ChatFiles } from "./files";
import { byteRange } from "./range";
import type { ChatStore } from "./store";

export const createFileRoutes = ({
  store,
  files,
  openFile,
}: {
  store: Pick<ChatStore, "get">;
  files: ChatFiles;
  openFile: (path: string) => Blob;
}) => {
  const app = new Hono<{ Variables: { viewer: Viewer; accounts: SessionAccount[] } }>();

  const visible = async (id: string, viewer: Viewer) => {
    const channel = await store.get(id);
    return channel && canSee(channel, viewer) ? channel : null;
  };

  // The file, its small picture and the form around it: read no more than that.
  app.post("/channels/:id/files", limitBody(MAX_FILE_BYTES + 2 * 1024 * 1024), async (c) => {
    const viewer = c.get("viewer");
    const channel = await visible(c.req.param("id"), viewer);
    if (!channel) return c.json({ error: "Unbekannter Kanal" }, 404);
    const form = await c.req.formData().catch(() => null);
    const file = form?.get("file");
    const thumb = form?.get("thumb");
    // A form field is text or a file.
    if (!file || typeof file === "string" || file.size === 0) {
      return c.json({ error: "Keine Datei." }, 400);
    }
    if (file.size > MAX_FILE_BYTES) {
      return c.json({ error: "Die Datei ist größer als 25 MB." }, 413);
    }
    const sealed = form?.get("kind") === "sealed";
    // In a confidential channel only encrypted files, without a readable name or small picture.
    if (sealed !== channel.confidential) return c.json({ error: NOT_SEALED }, 400);
    if (sealed) {
      const [first] = new Uint8Array(await file.slice(0, 1).arrayBuffer());
      if (!looksSealed(first)) return c.json({ error: NOT_SEALED }, 400);
      const blind = new File([file], "verschlüsselt", { type: SEALED_FILE_TYPE });
      return c.json(
        { file: await files.save(channel.id, viewer.me, blind, undefined, SEALED_FILE_TYPE) },
        201,
      );
    }
    const small = thumb && typeof thumb !== "string" ? thumb : undefined;
    // A mail shared as a copy says so; its content is shown only from its card. A voice message
    // is audio, whatever its name makes of it.
    const kind = form?.get("kind");
    const type =
      kind === "mail-copy"
        ? MAIL_COPY_TYPE
        : kind === "voice"
          ? (voiceType(file.name) ?? file.type)
          : file.type;
    return c.json({ file: await files.save(channel.id, viewer.me, file, small, type) }, 201);
  });

  app.get("/files/:id", async (c) => {
    const file = await files.get(c.req.param("id"));
    const channel = file && (await visible(file.channelId, c.get("viewer")));
    if (!file || !channel) return c.json({ error: "Unbekannte Datei" }, 404);
    // The small picture of a photo, where there is one.
    if (c.req.query("thumb") && file.thumbPath) {
      return new Response(openFile(file.thumbPath), {
        headers: {
          "content-type": "image/jpeg",
          "content-security-policy": "sandbox",
          "x-content-type-options": "nosniff",
          "cache-control": "private, max-age=31536000, immutable",
        },
      });
    }
    // Photos and voice messages show in the page; everything else is a download that cannot run
    // in this origin.
    const inline = INLINE_TYPES.includes(file.type) || isVoice(file.type);
    const headers = {
      "content-type": inline ? file.type : "application/octet-stream",
      "content-disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "content-security-policy": "sandbox",
      "x-content-type-options": "nosniff",
      "cache-control": "private, max-age=31536000, immutable",
      "accept-ranges": "bytes",
    };
    const range = byteRange(c.req.header("range"), file.size);
    if (range === "unsatisfiable") {
      return new Response(null, {
        status: 416,
        headers: { ...headers, "content-range": `bytes */${file.size}` },
      });
    }
    if (!range) {
      return new Response(openFile(file.path), {
        headers: { ...headers, "content-length": String(file.size) },
      });
    }
    return new Response(openFile(file.path).slice(range.start, range.end + 1), {
      status: 206,
      headers: {
        ...headers,
        "content-length": String(range.end - range.start + 1),
        "content-range": `bytes ${range.start}-${range.end}/${file.size}`,
      },
    });
  });

  return app;
};
