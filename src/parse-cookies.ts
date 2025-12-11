export function parseCookies(cookiesString: string) {
  const cookies = [];
  const cookiePairs = cookiesString.split(";");

  for (const pair of cookiePairs) {
    const trimmed = pair.trim();
    if (trimmed) {
      const [name, ...valueParts] = trimmed.split("=");
      const value = valueParts.join("=");

      if (name && value) {
        cookies.push({
          name: name.trim(),
          value: decodeURIComponent(value.trim()),
          domain: ".geoguessr.com",
        });
      }
    }
  }

  return cookies;
}
