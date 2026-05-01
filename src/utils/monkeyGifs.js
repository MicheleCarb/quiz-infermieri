export async function loadMonkeyGifs(baseUrl) {
  const [correct, wrong] = await Promise.all([
    loadGifList(`${baseUrl}monkeys/correct.txt`),
    loadGifList(`${baseUrl}monkeys/wrong.txt`),
  ]);

  return { correct, wrong };
}

export function getRandomMonkeyGif(result, gifLists) {
  const options = gifLists?.[result] || [];
  if (options.length === 0) return null;

  return options[Math.floor(Math.random() * options.length)];
}

async function loadGifList(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`Lista GIF non caricata: ${url} (${response.status})`);
      return [];
    }

    const text = await response.text();
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map(parseGifEntry)
      .filter(Boolean);
  } catch (error) {
    console.warn(`Errore nel caricamento della lista GIF: ${url}`, error);
    return [];
  }
}

function parseGifEntry(entry) {
  const tenorPostId = getTenorPostId(entry);

  if (tenorPostId) {
    return {
      type: 'tenor',
      src: `https://tenor.com/embed/${tenorPostId}`,
    };
  }

  return {
    type: 'image',
    src: entry,
  };
}

function getTenorPostId(entry) {
  const embedMatch = entry.match(/data-postid=["']?(\d+)/i);
  if (embedMatch) return embedMatch[1];

  const tenorUrlMatch = entry.match(/tenor\.com\/(?:[a-z]{2}\/)?view\/.*?-(\d+)(?:\D|$)/i);
  if (tenorUrlMatch) return tenorUrlMatch[1];

  return null;
}
