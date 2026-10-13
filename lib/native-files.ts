"use client";

import { registerPlugin } from "@capacitor/core";

/**
 * The native half of the file features (sharing a card, backing up favorites).
 *
 * None of the web APIs these replace work in the Capacitor WebView: there is no
 * download manager behind `<a download>`, no Web Share API to hand a file to,
 * and `navigator.clipboard.write` can't put an image on the clipboard. So on
 * device every file goes through the platform instead.
 *
 * A share card goes to the system share sheet (that's the point of sharing
 * one), while a favorites backup is simply saved into Downloads — see
 * `downloadNativeFile` — since there is nothing to choose about a backup file.
 */

/** Where a native action ended up, so the UI can say something true. */
export type NativeOutcome = "done" | "cancelled" | "unavailable";

export interface NativeFile {
  /** The name the saving app (Files, Drive, mail…) will show. */
  name: string;
  /** The file's bytes, base64 — what Capacitor writes when no encoding is given. */
  base64: string;
}

/**
 * Puts an image file on the system clipboard (android/app/.../ImageClipboardPlugin.java).
 * The plugin hands the pasting app a content:// URI with an image/* clip, the
 * way Chrome's "Copy image" does.
 */
const ImageClipboard = registerPlugin<{ copyImage(options: { uri: string; mime: string }): Promise<void> }>(
  "ImageClipboard"
);

/**
 * Saves a file into the device's Downloads folder
 * (android/app/.../FileDownloadPlugin.java).
 */
const FileDownload = registerPlugin<{
  save(options: { name: string; base64: string; mime: string }): Promise<{ name: string; location: string }>;
}>("FileDownload");

/** Base64 of a UTF-8 string, as Capacitor's file writer expects it. */
export function textToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** The UTF-8 text of a base64 payload, of the kind the file picker returns. */
export function base64ToText(base64: string): string {
  const binary = atob(base64.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Native sheets and pickers reject when the user backs out of them. */
function isCancellation(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /cancel/i.test(message);
}

/**
 * Write the file into the app's cache and return the file:// URI Capacitor
 * reports. The cache is covered by the FileProvider the share and clipboard
 * plugins talk to, so both can reach the file from a file:// URI.
 */
async function writeCacheFile({ name, base64 }: NativeFile): Promise<string> {
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  const { uri } = await Filesystem.writeFile({
    path: name,
    data: base64,
    directory: Directory.Cache,
    recursive: true,
  });
  return uri;
}

/**
 * Hand a file to the system share sheet.
 *
 * On Android this is the only honest way to "save" a file: the WebView can't
 * download one, and writing to the public Documents folder needs storage
 * permissions. The sheet is where Save to Files, Drive, Photos, Quick Share and
 * mail live, so the file lands wherever the user wants it — and the cache file
 * it points at is covered by the app's FileProvider.
 */
export async function shareNativeFile(
  file: NativeFile,
  options: { title: string; text?: string; dialogTitle: string }
): Promise<NativeOutcome> {
  let uri: string;
  try {
    uri = await writeCacheFile(file);
  } catch {
    return "unavailable";
  }

  try {
    const { Share } = await import("@capacitor/share");
    await Share.share({
      title: options.title,
      text: options.text,
      files: [uri],
      dialogTitle: options.dialogTitle,
    });
    return "done";
  } catch (error) {
    return isCancellation(error) ? "cancelled" : "unavailable";
  }
}

/**
 * Save a file straight into the device's Downloads folder and report what it
 * ended up being called. No share sheet is involved: Android writes the file
 * itself (MediaStore from API 29 on, the public Downloads folder before that).
 *
 * Rejects when the save can't happen — the caller decides what to do then.
 */
export async function downloadNativeFile(file: NativeFile & { mime: string }): Promise<NativeDownload> {
  return FileDownload.save({ name: file.name, base64: file.base64, mime: file.mime });
}

/** Where a downloaded file ended up, as the UI should say it. */
export interface NativeDownload {
  /** The name it was saved under, which differs if that name was taken. */
  name: string;
  /** The folder in shared storage, e.g. "Downloads". */
  location: string;
}

/** Put an image on the system clipboard. False when it can't be done. */
export async function copyNativeImage(file: NativeFile, mime = "image/png"): Promise<boolean> {
  try {
    const uri = await writeCacheFile(file);
    await ImageClipboard.copyImage({ uri, mime });
    return true;
  } catch {
    return false;
  }
}

/** Anything bigger than this is not a favorites backup, and reading it can kill the app. */
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

/**
 * Ask the device for one file and read it as UTF-8 text.
 *
 * This replaces the `<input type="file">` on device: the picker returns the
 * file's bytes itself, so nothing depends on the WebView handing a content://
 * URI back to a file input. Returns null when the user backs out.
 */
export async function pickNativeTextFile(
  types: string[],
  maxBytes = MAX_IMPORT_BYTES
): Promise<{ name: string; text: string } | null> {
  const { FilePicker } = await import("@capawesome/capacitor-file-picker");

  let picked;
  try {
    picked = await FilePicker.pickFiles({ types, limit: 1, readData: true });
  } catch (error) {
    if (isCancellation(error)) return null;
    throw new Error("the file picker couldn't be opened");
  }

  const file = picked.files[0];
  if (!file) return null;
  if (file.size > maxBytes) {
    throw new Error(`that file is larger than ${Math.round(maxBytes / (1024 * 1024))} MB`);
  }
  if (!file.data) throw new Error("that file couldn't be read");

  return { name: file.name, text: base64ToText(file.data) };
}

/**
 * The types a favorites backup can arrive as. Android matches these against the
 * file extension, and different file providers disagree about CSV, so the list
 * is deliberately generous (plus octet-stream, which some providers report for
 * anything they don't recognise).
 */
export const FAVORITES_FILE_TYPES = [
  "text/csv",
  "text/comma-separated-values",
  "text/plain",
  "application/csv",
  "application/vnd.ms-excel",
  "application/octet-stream",
];
