// A minimal YouTube Data API v3 client on fetch: channels.list, videos.insert
// (resumable upload), videos.update, captions.insert, playlists.list /
// playlists.insert, playlistItems.insert and thumbnails.set.
// getToken is an async function returning an access token; fetchImpl and
// readChunk are injectable so the upload loop is unit tested without network.
import fs from 'node:fs';

const API = 'https://www.googleapis.com/youtube/v3';
const UPLOAD = 'https://www.googleapis.com/upload/youtube/v3';
export const CHUNK = 8 * 1024 * 1024; // a multiple of 256 KiB, as the resumable protocol requires

async function readFileChunk(filePath, start, length) {
  const fh = await fs.promises.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(length);
    const { bytesRead } = await fh.read(buf, 0, length, start);
    return buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

export function createYouTubeClient({ getToken, fetchImpl = fetch, readChunk = readFileChunk, fileSize = (p) => fs.statSync(p).size, chunkSize = CHUNK } = {}) {
  const auth = async (extra = {}) => ({ authorization: `Bearer ${await getToken()}`, ...extra });

  async function call(method, url, { body, headers } = {}) {
    const res = await fetchImpl(url, { method, headers: await auth(headers), body });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    if (!res.ok) {
      const msg = json?.error?.message || text.slice(0, 300) || res.statusText;
      const err = new Error(`YouTube ${method} ${new URL(url).pathname} failed (${res.status}): ${msg}`);
      err.status = res.status;
      throw err;
    }
    return json;
  }

  const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v != null)).toString();
  const jsonHeaders = { 'content-type': 'application/json; charset=utf-8' };

  return {
    channelsMine(part = 'snippet') {
      return call('GET', `${API}/channels?${qs({ part, mine: 'true' })}`);
    },

    /** Resumable upload. resource is { snippet, status }. Returns the video resource. */
    async videosInsert({ filePath, resource, part = 'snippet,status', contentType = 'video/mp4', onProgress }) {
      const size = fileSize(filePath);
      const start = await fetchImpl(`${UPLOAD}/videos?${qs({ uploadType: 'resumable', part })}`, {
        method: 'POST',
        headers: await auth({ ...jsonHeaders, 'x-upload-content-length': String(size), 'x-upload-content-type': contentType }),
        body: JSON.stringify(resource),
      });
      if (!start.ok) throw new Error(`YouTube upload session failed (${start.status}): ${(await start.text()).slice(0, 300)}`);
      const session = start.headers.get('location');
      if (!session) throw new Error('YouTube gave no upload session URL.');

      let offset = 0;
      for (let guard = 0; guard < 100000; guard += 1) {
        const len = Math.min(chunkSize, size - offset);
        const chunk = await readChunk(filePath, offset, len);
        const res = await fetchImpl(session, {
          method: 'PUT',
          headers: await auth({ 'content-length': String(chunk.length), 'content-range': `bytes ${offset}-${offset + chunk.length - 1}/${size}`, 'content-type': contentType }),
          body: chunk,
        });
        if (res.status === 200 || res.status === 201) return res.json();
        if (res.status !== 308) throw new Error(`YouTube upload chunk failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
        const range = res.headers.get('range'); // "bytes=0-8388607"
        offset = range ? Number(range.split('-')[1]) + 1 : offset + chunk.length;
        if (onProgress) onProgress(offset, size);
      }
      throw new Error('YouTube upload did not finish.');
    },

    videosUpdate({ resource, part = 'snippet,status' }) {
      return call('PUT', `${API}/videos?${qs({ part })}`, { body: JSON.stringify(resource), headers: jsonHeaders });
    },

    /** captions.insert with a multipart body: the snippet then the caption file. */
    async captionsInsert({ videoId, filePath, language = 'en-GB', name = 'English (UK)', content }) {
      const boundary = `pl${Date.now().toString(36)}`;
      const file = content ?? fs.readFileSync(filePath, 'utf8');
      const body = [
        `--${boundary}`, 'Content-Type: application/json; charset=UTF-8', '',
        JSON.stringify({ snippet: { videoId, language, name, isDraft: false } }),
        `--${boundary}`, 'Content-Type: application/octet-stream', '',
        file,
        `--${boundary}--`, '',
      ].join('\r\n');
      return call('POST', `${UPLOAD}/captions?${qs({ uploadType: 'multipart', part: 'snippet' })}`, { body, headers: { 'content-type': `multipart/related; boundary=${boundary}` } });
    },

    playlistsMine() {
      return call('GET', `${API}/playlists?${qs({ part: 'snippet,status', mine: 'true', maxResults: 50 })}`);
    },

    playlistsInsert({ title, description = '', privacyStatus = 'private' }) {
      return call('POST', `${API}/playlists?${qs({ part: 'snippet,status' })}`, {
        body: JSON.stringify({ snippet: { title, description, defaultLanguage: 'en-GB' }, status: { privacyStatus } }),
        headers: jsonHeaders,
      });
    },

    playlistItemsInsert({ playlistId, videoId }) {
      return call('POST', `${API}/playlistItems?${qs({ part: 'snippet' })}`, {
        body: JSON.stringify({ snippet: { playlistId, resourceId: { kind: 'youtube#video', videoId } } }),
        headers: jsonHeaders,
      });
    },

    thumbnailsSet({ videoId, filePath, contentType = 'image/png' }) {
      return call('POST', `${UPLOAD}/thumbnails/set?${qs({ videoId })}`, { body: fs.readFileSync(filePath), headers: { 'content-type': contentType } });
    },
  };
}
