/** The editor of the mail's text: formatting, links, pictures pasted or dropped in. */
import Placeholder from "@tiptap/extension-placeholder";
import { useEditor } from "@tiptap/react";
import type { RefObject } from "react";
import { m } from "@/paraglide/messages";
import { pictures } from "./composer-images";
import type { ComposerState } from "./composer-state";
import { richText, spellChecked } from "./rich-text";

/**
 * `insertPictures`: pictures pasted or dropped into the text; set once the pictures hook has the
 * editor. Every change after the form is filled counts for the autosave.
 */
export const useComposerEditor = (
  state: ComposerState,
  insertPictures: RefObject<(files: File[]) => void>,
) =>
  useEditor({
    extensions: [
      ...richText({ autolink: true, images: true }),
      Placeholder.configure({ placeholder: m.mail_body_placeholder() }),
    ],
    onUpdate: () => {
      if (state.initialized.current) state.setChanges((n) => n + 1);
    },
    editorProps: {
      handlePaste: (_view, event) => {
        const files = pictures(event.clipboardData?.files);
        if (!files.length) return false;
        insertPictures.current(files);
        return true;
      },
      handleDrop: (_view, event, _slice, moved) => {
        const files = moved ? [] : pictures(event.dataTransfer?.files);
        if (!files.length) return false;
        event.preventDefault();
        insertPictures.current(files);
        return true;
      },
      attributes: {
        "aria-label": m.mail_body_placeholder(),
        role: "textbox",
        "aria-multiline": "true",
        ...spellChecked(),
      },
    },
  });
