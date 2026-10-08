import { useEffect, useMemo, useState } from 'react';
import type { Attachment } from '../../../../types';
import { isFileAttachment } from '../../../../types';
import { isPictureName } from './fileType';
import { loadFilePreview } from './loadFilePreview';

/**
 * The picture of every attached file that is a picture, by attachment id.
 *
 * A picture picked by path reaches the composer as a file, with nothing but a
 * path. The viewer needs the picture itself, so each one is asked of the backend,
 * the same answer its card shows, remembered by path so nothing is read twice.
 * A picture too big to send, or not there any more, has no entry and cannot be
 * opened; its card keeps the icon.
 */
export function usePictureSources(attachments: Attachment[]): Record<string, string> {
  const pictureFiles = useMemo(
    () => attachments.filter(isFileAttachment).filter((file) => isPictureName(file.fileName)),
    [attachments],
  );
  const [sources, setSources] = useState<Record<string, string>>({});

  useEffect(() => {
    let current = true;
    for (const file of pictureFiles) {
      void loadFilePreview(file.absolutePath).then((preview) => {
        if (current && preview.kind === 'image') {
          setSources((known) => (known[file.id] === preview.src ? known : { ...known, [file.id]: preview.src }));
        }
      });
    }
    return () => {
      current = false;
    };
  }, [pictureFiles]);

  return sources;
}
