const owner = process.env.GITHUB_OWNER || 'bekfft';
const repo = process.env.GITHUB_REPO || 'Guildora';
const releaseVersion = process.env.RELEASE_VERSION;
const releaseTag = process.env.RELEASE_TAG;

const endpoint = releaseTag
  ? `https://api.github.com/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(releaseTag)}`
  : 'https://api.github.com/repos/' + owner + '/' + repo + '/releases/latest';

async function verify() {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Guildora-Release-Verification',
    'X-GitHub-Api-Version': '2022-11-28'
  };
  if (process.env.GH_TOKEN) headers.Authorization = `Bearer ${process.env.GH_TOKEN}`;
  const response = await fetch(endpoint, { headers });
  if (!response.ok) throw new Error(`GitHub antwortete mit HTTP ${response.status}.`);
  const release = await response.json();
  const assets = release.assets || [];
  const hasInstaller = assets.some(({ name }) => (
    /^Guildora-Setup-.*\.exe$/i.test(name)
    && (!releaseVersion || name.includes(releaseVersion))
  ));
  const hasMetadata = assets.some(({ name }) => name === 'latest.yml');
  if (!hasInstaller || !hasMetadata) {
    throw new Error(`Release unvollständig: Installer=${hasInstaller}, latest.yml=${hasMetadata}`);
  }
  console.log(`Release ${release.tag_name} ist vollständig: .exe und latest.yml vorhanden.`);
}

verify().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
