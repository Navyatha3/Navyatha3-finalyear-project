#app/services/document_brain.py
"""
Document Brain Service (NotebookLM Mode)
========================================
Specialized brain for analyzing user-uploaded documents.

Features:
- PDF upload and processing
- Semantic search within documents
- Citation generation with exact references
- Document summarization
- Multi-document comparison
"""

import os
import json
import asyncio
import hashlib
import re
from collections import Counter
from typing import Dict, List, Optional, Tuple
from datetime import datetime
from pathlib import Path
from app.config import settings
from app.services.llm_factory import get_ollama_llm
from app.services.embeddings_instance import embeddings
from langchain_core.prompts import ChatPromptTemplate
from langchain_community.vectorstores import FAISS
from langchain_text_splitters import RecursiveCharacterTextSplitter
import fitz  # PyMuPDF


# =============================================================================
# CONFIGURATION
# =============================================================================

OLLAMA_MODEL = settings.OLLAMA_MODEL_DOC
UPLOAD_DIR = settings.UPLOAD_DIR
VECTOR_DB_DIR = str(Path(settings.SYLLABUS_INDEX_PATH).parent)

print("📄 Initializing Document Brain...")

# Create directories if not exist
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(VECTOR_DB_DIR, exist_ok=True)

llm = get_ollama_llm(
    model_name=OLLAMA_MODEL,
    temperature=0.7,
    max_tokens=1024,
)

def _compute_file_hash(pdf_path: str) -> str:
    """
    SHA-256 hash of the PDF file contents.
    Used to detect duplicate uploads so we never build the same
    vector index twice.
    """
    sha256 = hashlib.sha256()
    with open(pdf_path, "rb") as file_handle:
        for chunk in iter(lambda: file_handle.read(8192), b""):
            sha256.update(chunk)
    return sha256.hexdigest()


# In-memory document tracking
document_registry: dict = {}
_hash_to_doc_id: dict = {}


# =============================================================================
# PROMPT TEMPLATES
# =============================================================================

SUMMARIZATION_PROMPT = ChatPromptTemplate.from_messages([
    ("system", """You are an expert document analyst.
Create a concise 2-3 sentence summary of this document.
Start with the main topic, then key concepts.
Format: "This document covers [topic]. Key concepts include [list]."

Document Content: {content}"""),
    ("human", "Summarize this document:")
])

CITATION_PROMPT = ChatPromptTemplate.from_messages([
    ("system", """You are a precise academic writer.
Answer the question using ONLY the provided document excerpts.
Add citations in [Page X] format.

If information is not in the document, say: "This information is not covered in the document."

Document Excerpts: {context}"""),
    ("human", "Question: {question}\nAnswer with citations:")
])

RELEVANCE_CHECK_PROMPT = ChatPromptTemplate.from_messages([
    ("system", """Check if the document excerpt is relevant to the question.
Return ONLY "YES" or "NO"."""),
    ("human", """Question: {question}
Excerpt: {excerpt}
Is this relevant?""")
])

QUESTION_GENERATION_PROMPT = ChatPromptTemplate.from_messages([
    ("system", """You are a teacher creating study questions based on a document.
Generate 3-5 challenging but fair questions about the document content.
Format each on a new line, numbered.

Document: {document_text}"""),
    ("human", "Generate study questions:")
])


# =============================================================================
# PDF PROCESSING FUNCTIONS
# =============================================================================

def extract_text_from_pdf(pdf_path: str) -> Dict[int, str]:
    """
    Extract text from PDF with page numbers.
    
    Args:
        pdf_path: Path to PDF file
        
    Returns:
        Dict mapping page numbers to text
    """
    pages = {}
    
    try:
        doc = fitz.open(pdf_path)
        
        for page_num, page in enumerate(doc, 1):
            text = page.get_text()
            if text.strip():
                pages[page_num] = text
        
        doc.close()
        print(f"✅ Extracted {len(pages)} pages from PDF")
        return pages
    except Exception as e:
        print(f"❌ PDF extraction error: {e}")
        return {}


def create_document_chunks(
    pdf_path: str,
    document_id: str,
    chunk_size: int = 1000,
    overlap: int = 200
) -> List[Dict]:
    """
    Process PDF into semantic chunks with metadata.
    
    Args:
        pdf_path: Path to PDF file
        document_id: Unique document identifier
        chunk_size: Characters per chunk
        overlap: Character overlap between chunks
        
    Returns:
        List of chunk dicts with content and metadata
    """
    pages = extract_text_from_pdf(pdf_path)
    
    if not pages:
        return []
    
    # Text splitter
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=overlap
    )
    
    chunks = []
    chunk_id = 0
    
    for page_num, page_text in sorted(pages.items()):
        # Split this page's text
        page_chunks = splitter.split_text(page_text)
        
        for chunk_text in page_chunks:
            chunk_id += 1
            
            chunk = {
                "id": f"{document_id}_chunk_{chunk_id}",
                "document_id": document_id,
                "content": chunk_text,
                "page": page_num,
                "chunk_number": chunk_id,
                "created_at": datetime.now().isoformat()
            }
            
            chunks.append(chunk)
    
    print(f"✅ Created {len(chunks)} chunks for {document_id}")
    return chunks


def extract_overview_from_pages(pages: Dict[int, str]) -> Tuple[str, List[str]]:
    """Create a compact summary and keyword topics from extracted PDF text."""
    if not pages:
        return "Summary unavailable.", []

    sample_text = " ".join(pages[page] for page in sorted(pages.keys())[:4])
    sample_text = re.sub(r"\s+", " ", sample_text).strip()[:6000]

    if not sample_text:
        return "Summary unavailable.", []

    sentences = [
        sentence.strip()
        for sentence in re.split(r"(?<=[.!?])\s+", sample_text)
        if sentence.strip()
    ]

    summary = " ".join(sentences[:2]).strip()
    if len(summary) < 60:
        summary = sample_text[:260].strip()

    if summary and not summary.endswith((".", "!", "?")):
        summary += "."

    stop_words = {
        "this", "that", "with", "from", "into", "about", "which", "their",
        "these", "those", "there", "where", "when", "while", "under", "using",
        "have", "has", "had", "were", "been", "being", "than", "then", "also",
        "such", "some", "each", "will", "would", "should", "could", "can", "cannot",
        "the", "and", "for", "are", "was", "you", "your", "our", "they", "them",
        "its", "his", "her", "she", "him", "all", "any", "not", "but", "because",
        "chapter", "unit", "course", "student", "students", "page", "pages",
    }

    tokens = re.findall(r"[A-Za-z][A-Za-z\-]{3,}", sample_text.lower())
    frequency = Counter(token for token in tokens if token not in stop_words)

    topics = []
    for token, _count in frequency.most_common(6):
        normalized = token.replace("-", " ").title()
        if normalized not in topics:
            topics.append(normalized)

    return summary or "Summary unavailable.", topics


# =============================================================================
# VECTOR STORE MANAGEMENT
# =============================================================================

def build_document_index(
    pdf_path: str,
    document_id: str,
    save_path: str
) -> Optional[FAISS]:
    """
    Build FAISS vector index for a document.
    
    Args:
        pdf_path: Path to PDF
        document_id: Unique ID for document
        save_path: Where to save the index
        
    Returns:
        FAISS vector store or None
    """
    print(f"\n🔮 Building vector index for {document_id}...")
    
    # Create chunks
    chunks = create_document_chunks(pdf_path, document_id)
    
    if not chunks:
        print("❌ No chunks created")
        return None
    
    try:
        # Convert chunks to LangChain documents
        from langchain_core.documents import Document
        
        docs = [
            Document(
                page_content=chunk["content"],
                metadata={
                    "document_id": chunk["document_id"],
                    "page": chunk["page"],
                    "chunk_number": chunk["chunk_number"]
                }
            )
            for chunk in chunks
        ]
        
        # Build vector store
        vector_store = FAISS.from_documents(docs, embeddings)
        
        # Save index
        os.makedirs(save_path, exist_ok=True)
        vector_store.save_local(save_path)
        
        print(f"✅ Index saved to {save_path}")
        return vector_store
    except Exception as e:
        print(f"❌ Index creation error: {e}")
        return None


def load_document_index(index_path: str) -> Optional[FAISS]:
    """Load pre-built document index."""
    if not os.path.exists(index_path):
        return None
    
    try:
        return FAISS.load_local(
            index_path,
            embeddings,
            allow_dangerous_deserialization=True
        )
    except Exception as e:
        print(f"⚠️ Failed to load index: {e}")
        return None


# =============================================================================
# DOCUMENT ANALYSIS FUNCTIONS
# =============================================================================

async def summarize_document(
    pdf_path: str,
    document_id: str
) -> str:
    """
    Generate summary for uploaded document.
    
    Args:
        pdf_path: Path to PDF
        document_id: Document ID
        
    Returns:
        Summary text
    """
    pages = extract_text_from_pdf(pdf_path)
    
    # Use first few pages for summary
    sample_text = "\n".join([
        pages[p] for p in sorted(pages.keys())[:5]
    ])[:2000]  # First 2000 chars from first 5 pages
    
    try:
        chain = SUMMARIZATION_PROMPT | llm
        response = chain.invoke({"content": sample_text})
        return response.content.strip()
    except Exception as e:
        print(f"❌ Summarization error: {e}")
        return "Summary unavailable"


def retrieve_relevant_chunks(
    vector_store: FAISS,
    query: str,
    k: int = 3
) -> List[Tuple[str, int]]:
    """
    Retrieve relevant document chunks for a query.
    
    Args:
        vector_store: FAISS vector store
        query: User's question
        k: Number of chunks to retrieve
        
    Returns:
        List of (text, page_number) tuples
    """
    chunks: List[Tuple[str, int]] = []

    try:
        # Preferred path: keep relevance-score retrieval when available.
        results = vector_store.similarity_search_with_relevance_scores(query, k=k)
        chunks = [
            (doc.page_content, int(doc.metadata.get("page", 0) or 0))
            for doc, _score in results
            if getattr(doc, "page_content", "").strip()
        ]
        if chunks:
            return chunks
    except Exception as e:
        # Some LangChain/FAISS versions fail here despite a healthy index.
        print(f"⚠️ Relevance-score retrieval failed, falling back to similarity_search: {e}")

    try:
        fallback_docs = vector_store.similarity_search(query, k=max(k, 5))
        chunks = [
            (doc.page_content, int(doc.metadata.get("page", 0) or 0))
            for doc in fallback_docs
            if getattr(doc, "page_content", "").strip()
        ]
        if chunks:
            return chunks
    except Exception as e:
        print(f"❌ Similarity retrieval error: {e}")

    try:
        # Last resort: return first chunks from the index so user still gets useful output.
        broad_docs = vector_store.similarity_search("document overview", k=max(k, 5))
        chunks = [
            (doc.page_content, int(doc.metadata.get("page", 0) or 0))
            for doc in broad_docs
            if getattr(doc, "page_content", "").strip()
        ]
        return chunks
    except Exception as e:
        print(f"❌ Broad fallback retrieval error: {e}")
        return []


async def answer_document_question(
    query: str,
    vector_store: FAISS,
    document_id: str
) -> Dict:
    """
    Answer a question about the document.
    
    Args:
        query: User's question
        vector_store: Document's FAISS index
        document_id: Document ID for tracking
        
    Returns:
        Response dict with answer and citations
    """
    print(f"\n📄 DOCUMENT BRAIN: {query}")
    
    # Retrieve relevant chunks
    chunks = retrieve_relevant_chunks(vector_store, query, k=3)
    
    if not chunks:
        return {
            "answer": "No relevant information found in the document.",
            "brain": "document",
            "document_id": document_id,
            "citations": [],
            "confidence": 0.0
        }
    
    # Format context with page references
    context_parts = []
    citations = []
    
    for text, page in chunks:
        context_parts.append(f"[Page {page}]\n{text}")
        if page not in [c["page"] for c in citations]:
            citations.append({"page": page, "content": text[:100] + "..."})
    
    context = "\n---\n".join(context_parts)
    
    # Generate answer with citations
    try:
        chain = CITATION_PROMPT | llm
        response = chain.invoke({
            "context": context,
            "question": query
        })
        
        answer = response.content.strip()
        
        return {
            "answer": answer,
            "brain": "document",
            "document_id": document_id,
            "citations": citations,
            "pages_referenced": [c["page"] for c in citations],
            "confidence": 0.92
        }
    except Exception as e:
        print(f"❌ Answer generation error: {e}")
        return {
            "answer": "Error generating answer",
            "brain": "document",
            "document_id": document_id,
            "error": str(e),
            "confidence": 0.0
        }


async def generate_study_questions(
    pdf_path: str,
    document_id: str,
    num_questions: int = 3
) -> List[str]:
    """
    Generate study questions from document.
    
    Args:
        pdf_path: Path to PDF
        document_id: Document ID
        num_questions: Number of questions to generate
        
    Returns:
        List of questions
    """
    pages = extract_text_from_pdf(pdf_path)
    
    # Get sample text from document
    sample_text = "\n".join([
        pages[p] for p in sorted(pages.keys())[:5]
    ])[:1500]
    
    try:
        chain = QUESTION_GENERATION_PROMPT | llm
        response = chain.invoke({"document_text": sample_text})
        
        # Parse questions
        questions = [
            q.strip() for q in response.content.strip().split("\n")
            if q.strip() and q[0].isdigit()
        ]
        
        return questions[:num_questions]
    except Exception as e:
        print(f"⚠️ Question generation error: {e}")
        return []


# =============================================================================
# DOCUMENT REGISTRATION
# =============================================================================

def register_document(
    pdf_path: str,
    filename: str,
    session_id: str
) -> Dict:
    """
    Register newly uploaded document in system.

    Args:
        pdf_path: Path to PDF file
        filename: Original filename
        session_id: User session ID

    Returns:
        Document registration info
    """
    # Deduplication check
    try:
        file_hash = _compute_file_hash(pdf_path)
        if file_hash in _hash_to_doc_id:
            existing_id = _hash_to_doc_id[file_hash]
            print(f"♻️ Duplicate detected. Reusing existing index: {existing_id}")
            existing = document_registry.get(existing_id, {})
            return {
                "document_id": existing_id,
                "filename": filename,
                "status": "deduplicated",
                "chunks_created": existing.get("chunks_created", 0),
                "summary": existing.get("summary", "Summary unavailable."),
                "topics": existing.get("topics", []),
                "reused": True,
            }
    except Exception as e:
        print(f"⚠️ Hash computation failed (ignored): {e}")
        file_hash = None

    document_id = f"{session_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

    # Build index
    index_path = os.path.join(VECTOR_DB_DIR, document_id)
    vector_store = build_document_index(pdf_path, document_id, index_path)

    if not vector_store:
        return {"error": "Failed to process document"}

    chunks_created = vector_store.index.ntotal
    pages = extract_text_from_pdf(pdf_path)
    summary, topics = extract_overview_from_pages(pages)

    # Store in registry
    document_registry[document_id] = {
        "filename": filename,
        "session_id": session_id,
        "pdf_path": pdf_path,
        "index_path": index_path,
        "created_at": datetime.now().isoformat(),
        "vector_store": vector_store,
        "chunks_created": chunks_created,
        "file_hash": file_hash,
        "summary": summary,
        "topics": topics,
    }

    if file_hash:
        _hash_to_doc_id[file_hash] = document_id

    return {
        "document_id": document_id,
        "filename": filename,
        "status": "registered",
        "chunks_created": chunks_created,
        "summary": summary,
        "topics": topics,
        "reused": False,
    }


def get_document_store(document_id: str) -> Optional[FAISS]:
    """Get vector store for a document."""
    if document_id in document_registry:
        return document_registry[document_id]["vector_store"]
    
    # Try to load from disk
    index_path = os.path.join(VECTOR_DB_DIR, document_id)
    return load_document_index(index_path)


# =============================================================================
# TESTING
# =============================================================================

async def test_document_brain():
    """Test Document Brain with sample PDF."""
    
    print("\n" + "="*60)
    print("DOCUMENT BRAIN TEST")
    print("="*60)
    
    # Check if test PDF exists
    test_pdf = "data/test_document.pdf"
    
    if not os.path.exists(test_pdf):
        print(f"⚠️ Test PDF not found at {test_pdf}")
        print("Please upload a PDF to test the Document Brain")
        print("\nExample usage:")
        print("1. Place a PDF in data/uploads/")
        print("2. Document Brain will process and make it searchable")
        print("3. Ask questions about the document content")
        return
    
    # Test workflow
    print(f"\n📄 Loading test PDF...")
    doc_info = register_document(test_pdf, "test_document.pdf", "test_session")
    
    if "error" in doc_info:
        print(f"❌ {doc_info['error']}")
        return
    
    document_id = doc_info["document_id"]
    vector_store = get_document_store(document_id)
    
    # Test questions
    test_questions = [
        "What is the main topic of this document?",
        "List the key concepts mentioned",
        "What examples are provided?",
    ]
    
    print(f"\n✅ Document registered: {document_id}")
    print(f"📊 Chunks created: {doc_info['chunks_created']}")
    
    for question in test_questions:
        print(f"\n📝 Q: {question}")
        result = await answer_document_question(question, vector_store, document_id)
        print(f"✅ A: {result['answer'][:150]}...")
        print(f"📍 Pages: {result.get('pages_referenced', [])}")


if __name__ == "__main__":
    asyncio.run(test_document_brain())
