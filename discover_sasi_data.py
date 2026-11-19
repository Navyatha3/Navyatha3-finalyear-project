import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlsplit


def _is_pdf_link(href: str) -> bool:
    parsed = urlsplit(href)
    return parsed.path.lower().endswith(".pdf")


def discover_pdfs(url):
    print(f"🔍 Scanning for documents at: {url}")
    headers = {"User-Agent": "Mozilla/5.0"}

    try:
        resp = requests.get(url, headers=headers, timeout=20)
        resp.raise_for_status()
    except requests.RequestException as exc:
        print(f"❌ Failed to fetch page: {exc}")
        return []

    soup = BeautifulSoup(resp.text, "html.parser")
    links = soup.find_all("a", href=True)
    seen = set()
    found = []

    print("\n--- FOUND DOCUMENTS ---")
    for link in links:
        href = (link.get("href") or "").strip()
        if not href:
            continue

        absolute_url = urljoin(url, href)
        if not _is_pdf_link(absolute_url):
            continue

        normalized_url = absolute_url.split("#", 1)[0]
        if normalized_url in seen:
            continue
        seen.add(normalized_url)

        # Clean the name for display
        display_name = link.text.strip() or normalized_url.split("/")[-1]
        print(f"📄 {display_name}")
        print(f"🔗 URL: {normalized_url}\n")

        found.append({"name": display_name, "url": normalized_url})

    print(f"Total unique PDFs found on this page: {len(found)}")
    return found

if __name__ == "__main__":
    # Test it on the main CSE page
    discover_pdfs("https://sasi.ac.in/computer-science-engineering-and-allied-branches/")