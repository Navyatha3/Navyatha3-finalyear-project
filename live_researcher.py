# app/services/live_researcher.py
import asyncio
import requests
from tavily import TavilyClient
from urllib.parse import quote_plus, urljoin, urlparse
from bs4 import BeautifulSoup
from app.config import settings
from app.services.llm_factory import get_ollama_llm, ainvoke_with_memory_fallback


class SasiLiveResearcher:
    def __init__(self):
        # We use a lower temperature for facts to prevent hallucination
        self.llm = get_ollama_llm(
            model_name=settings.OLLAMA_MODEL_RESEARCHER,
            temperature=0.1,
            max_tokens=2048,
        )
        self.client = None
        self.enabled = bool(settings.TAVILY_API_KEY)

        if self.enabled:
            try:
                self.client = TavilyClient(api_key=settings.TAVILY_API_KEY)
            except Exception as exc:
                print(f"⚠️ Tavily initialization failed: {exc}")
                self.enabled = False

    def _search_sasi_without_tavily(self, query: str, max_results: int = 5):
        """Fallback scraper when Tavily is unavailable."""
        headers = {"User-Agent": "Mozilla/5.0"}
        search_url = f"https://sasi.ac.in/?s={quote_plus(query)}"

        try:
            resp = requests.get(search_url, headers=headers, timeout=15)
            resp.raise_for_status()
        except requests.RequestException as exc:
            return [], f"Search page request failed: {exc}"

        soup = BeautifulSoup(resp.text, "html.parser")
        candidates = []
        seen = set()

        for anchor in soup.find_all("a", href=True):
            href = (anchor.get("href") or "").strip()
            if not href:
                continue

            absolute = urljoin(search_url, href)
            parsed = urlparse(absolute)
            if parsed.scheme not in {"http", "https"}:
                continue
            if "sasi.ac.in" not in parsed.netloc:
                continue

            normalized = absolute.split("#", 1)[0]
            if normalized in seen:
                continue
            seen.add(normalized)

            title = (anchor.get_text() or "").strip() or parsed.path.rsplit("/", 1)[-1]
            candidates.append({"url": normalized, "title": title})

            if len(candidates) >= max_results * 2:
                break

        results = []
        for item in candidates:
            if len(results) >= max_results:
                break
            try:
                page_resp = requests.get(item["url"], headers=headers, timeout=8)
                page_resp.raise_for_status()
                page_soup = BeautifulSoup(page_resp.text, "html.parser")
                paragraphs = [p.get_text(" ", strip=True) for p in page_soup.find_all("p")]
                snippet = " ".join([p for p in paragraphs if p])[:900]
                if not snippet:
                    continue
                results.append({"url": item["url"], "title": item["title"], "content": snippet})
            except requests.RequestException:
                continue

        return results, None

    async def _synthesize_answer(self, query: str, context_parts):
        full_context = "\n---\n".join(context_parts)

        if not full_context:
            return {
                "answer": "I found no live data for this on the SASI website.",
                "sources": []
            }

        SYSTEM_PROMPT = """You are FusedChat Studio, a high-intelligence Research AI for SASI Institute.
You are currently reading the LIVE college website.

YOUR GOAL: Answer the question accurately using the provided context.

STYLE RULES:
1. Use **bold** for names, designations, and key dates.
2. If you find a schedule or data list, format it as a Markdown Table.
3. Use emojis to make the response lively (e.g., 🎓, 🚌, 📄).
4. At the end, clearly list the 'Verified Source Links' used.
"""

        USER_PROMPT = f"USER QUESTION: {query}\n\nLIVE DATA FOUND:\n{full_context}"

        print("🧠 [AI] Synthesizing live web data...")
        response = await ainvoke_with_memory_fallback(
            primary_llm=self.llm,
            payload=[
                ("system", SYSTEM_PROMPT),
                ("human", USER_PROMPT),
            ],
            fallback_model=settings.OLLAMA_MODEL_ROUTER,
            temperature=0.1,
            max_tokens=768,
        )
        return {"answer": response.content}

    async def execute(self, query: str):
        if not self.enabled or self.client is None:
            print("ℹ️ Tavily unavailable, using built-in site scraper fallback")
            fallback_results, fallback_error = await asyncio.to_thread(
                self._search_sasi_without_tavily,
                query,
                3,
            )

            if fallback_error:
                return {
                    "answer": f"Live web search fallback failed: {fallback_error}",
                    "sources": []
                }

            context_parts = [
                f"SOURCE URL: {result['url']}\nCONTENT: {result['content']}"
                for result in fallback_results
            ]
            synthesized = await self._synthesize_answer(query, context_parts)
            synthesized["sources"] = [r["url"] for r in fallback_results]
            return synthesized

        # Even tighter optimization for Tavily
        # Remove filler words so the search is laser-focused
        search_query = query.lower()
        for word in ["i", "want", "to", "know", "about", "search", "me", "the", "all"]:
            search_query = search_query.replace(f" {word} ", " ")

        search_query = f"site:sasi.ac.in {search_query.strip()}"
        print(f"🔍 [Tavily Search]: {search_query}")

        try:
            # 1. Targeted search and content extraction
            search_result = await asyncio.to_thread(
                self.client.search,
                query=search_query,
                search_depth="basic",
                max_results=3,
                include_raw_content=False,
                include_answer=False
            )

            # 2. Extract context from results
            context_parts = []
            for result in search_result.get("results", []):
                context_parts.append(
                    f"SOURCE URL: {result['url']}\nCONTENT: {result['content']}"
                )

            synthesized = await self._synthesize_answer(query, context_parts)

            return {
                "answer": synthesized["answer"],
                "sources": [r["url"] for r in search_result.get("results", [])]
            }

        except Exception as e:
            print(f"❌ Search Error: {e}")
            return {"answer": f"Search failed: {str(e)}", "sources": []}


if __name__ == "__main__":
    async def run():
        researcher = SasiLiveResearcher()
        res = await researcher.execute("Who is the HOD of CSE?")
        print(res["answer"])

    asyncio.run(run())