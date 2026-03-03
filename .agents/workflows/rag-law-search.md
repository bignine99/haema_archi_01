---
description: RAG 기반 법규 및 사례 검색 (Generative AI) - Vector DB, LangChain, Multi-Agent 오케스트레이션 가이드
---

# RAG 기반 법규 및 사례 검색 스킬

건축법·지자체 조례·과거 당선작 데이터를 벡터화하여 **설계 안의 법규 저촉 여부를 실시간 검토**하고,
Multi-Agent 시스템으로 법규 검토/대지 분석/프로그램 제안을 자동화하는 기술 가이드.

---

## 1. 아키텍처 개요

```
┌─────────────────────────────────────────────┐
│              프론트엔드 (React)               │
│  컨트롤 패널 ↔ 3D 뷰어 ↔ 대시보드 ↔ 챗봇    │
└──────────────────┬──────────────────────────┘
                   │ REST API
┌──────────────────┴──────────────────────────┐
│             오케스트레이터 (FastAPI)           │
│                                              │
│  ┌────────┐  ┌────────┐  ┌────────┐         │
│  │ 법규   │  │ 대지   │  │ 수익성 │  Agent  │
│  │ 검토   │  │ 분석   │  │ 분석   │  Pool   │
│  │ Agent  │  │ Agent  │  │ Agent  │         │
│  └───┬────┘  └───┬────┘  └───┬────┘         │
│      │           │           │               │
│  ┌───┴───────────┴───────────┴────┐          │
│  │       RAG Engine (LangChain)    │          │
│  │  Embedding → VectorDB → LLM    │          │
│  └───┬────────────────────────────┘          │
└──────┼───────────────────────────────────────┘
       │
┌──────┴──────────────────────┐
│     Vector DB (ChromaDB)     │
│                              │
│  📚 건축법 시행령             │
│  📚 지자체 조례              │
│  📚 설계 지침서              │
│  📚 과거 당선작 분석          │
│  📚 판례·심의 결과           │
└─────────────────────────────┘
```

---

## 2. Vector DB 구축

### 2-1. ChromaDB (로컬, 경량)

```bash
pip install chromadb langchain-chroma
```

```python
import chromadb
from chromadb.config import Settings

# 영속 저장 모드
client = chromadb.PersistentClient(path="./chroma_db")

# 컬렉션 생성
law_collection = client.get_or_create_collection(
    name="building_laws",
    metadata={"description": "건축법 시행령 및 지자체 조례"}
)

case_collection = client.get_or_create_collection(
    name="design_cases",
    metadata={"description": "과거 현상설계 당선작 분석"}
)
```

### 2-2. 건축법 데이터 벡터화

```python
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings
from langchain_chroma import Chroma

def index_building_laws(law_texts: list[dict]) -> Chroma:
    """
    건축법 조문을 벡터 DB에 인덱싱
    
    law_texts 예시:
    [
        {
            "title": "건축법 제56조 (건축물의 용적률)",
            "content": "대지면적에 대한 연면적의 비율은...",
            "source": "건축법",
            "article": "제56조",
            "category": "용적률"
        },
        ...
    ]
    """
    # 텍스트 분할 (조문 단위 유지)
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=500,
        chunk_overlap=50,
        separators=["\n\n", "\n", ".", " "],
    )
    
    documents = []
    metadatas = []
    
    for law in law_texts:
        chunks = splitter.split_text(law['content'])
        for chunk in chunks:
            documents.append(chunk)
            metadatas.append({
                'title': law['title'],
                'source': law['source'],
                'article': law.get('article', ''),
                'category': law.get('category', ''),
            })
    
    # 임베딩 + 인덱싱
    embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
    
    vectorstore = Chroma.from_texts(
        texts=documents,
        metadatas=metadatas,
        embedding=embeddings,
        collection_name="building_laws",
        persist_directory="./chroma_db",
    )
    
    return vectorstore
```

### 2-3. Pinecone (클라우드, 대규모)

```bash
pip install pinecone-client langchain-pinecone
```

```python
from pinecone import Pinecone
from langchain_pinecone import PineconeVectorStore
from langchain_openai import OpenAIEmbeddings

# Pinecone 초기화
pc = Pinecone(api_key="YOUR_PINECONE_API_KEY")

# 인덱스 생성 (최초 1회)
if "building-laws" not in pc.list_indexes().names():
    pc.create_index(
        name="building-laws",
        dimension=1536,           # text-embedding-3-small
        metric="cosine",
        spec={"serverless": {"cloud": "aws", "region": "us-east-1"}}
    )

index = pc.Index("building-laws")
embeddings = OpenAIEmbeddings(model="text-embedding-3-small")

vectorstore = PineconeVectorStore(
    index=index,
    embedding=embeddings,
    text_key="text",
)
```

---

## 3. RAG 질의응답 체인

### 3-1. 기본 RAG Chain

```python
from langchain_openai import ChatOpenAI
from langchain.chains import RetrievalQA
from langchain.prompts import PromptTemplate

# 건축 법규 전문가 프롬프트
BUILDING_LAW_PROMPT = PromptTemplate(
    template="""당신은 한국 건축법 전문가입니다. 아래 참고 자료를 기반으로 질문에 답변하세요.

참고 자료:
{context}

질문: {question}

답변 시 다음 형식을 따르세요:
1. **관련 법규**: 해당 법조문 명시
2. **적용 기준**: 구체적 수치와 조건
3. **현 설계안 판단**: 적합/부적합 여부
4. **권고 사항**: 개선 방향 (해당 시)

답변:""",
    input_variables=["context", "question"],
)

def create_law_qa_chain(vectorstore):
    """건축법 Q&A 체인 생성"""
    retriever = vectorstore.as_retriever(
        search_type="mmr",              # Maximal Marginal Relevance
        search_kwargs={
            "k": 5,                     # 검색 결과 수
            "fetch_k": 20,              # MMR 후보 수
            "lambda_mult": 0.7,         # 다양성 vs 관련성 (0=다양, 1=관련)
        },
    )
    
    llm = ChatOpenAI(
        model="gpt-4o",
        temperature=0,
    )
    
    qa_chain = RetrievalQA.from_chain_type(
        llm=llm,
        chain_type="stuff",
        retriever=retriever,
        chain_type_kwargs={"prompt": BUILDING_LAW_PROMPT},
        return_source_documents=True,
    )
    
    return qa_chain
```

### 3-2. 설계안 법규 적합성 검토

```python
async def check_design_compliance(
    design_params: dict,
    qa_chain
) -> dict:
    """
    설계안의 법규 적합성을 자동 검토
    
    design_params 예시:
    {
        "address": "서울시 강남구 역삼동 123-45",
        "zone_type": "제3종 일반주거지역",
        "land_area": 330,           # ㎡
        "building_coverage": 55,     # %
        "floor_area_ratio": 250,     # %
        "total_floors": 10,
        "building_height": 33,       # m
        "parking_count": 20,
        "setback_distance": 1.5,     # m
    }
    """
    checks = []
    
    # 1. 건폐율 검토
    bcr_query = f"{design_params['zone_type']}의 건폐율 상한은 몇 퍼센트인가? 현재 설계 건폐율은 {design_params['building_coverage']}%입니다."
    bcr_result = await qa_chain.ainvoke({"query": bcr_query})
    checks.append({
        "category": "건폐율",
        "query": bcr_query,
        "answer": bcr_result['result'],
        "sources": [doc.metadata for doc in bcr_result['source_documents']],
    })
    
    # 2. 용적률 검토
    far_query = f"{design_params['zone_type']}의 용적률 상한은? 현재 설계 용적률은 {design_params['floor_area_ratio']}%입니다."
    far_result = await qa_chain.ainvoke({"query": far_query})
    checks.append({
        "category": "용적률",
        "query": far_query,
        "answer": far_result['result'],
        "sources": [doc.metadata for doc in far_result['source_documents']],
    })
    
    # 3. 높이 제한 검토
    height_query = f"{design_params['zone_type']}에서 건축물 높이 제한은? 현재 설계 높이는 {design_params['building_height']}m, {design_params['total_floors']}층입니다."
    height_result = await qa_chain.ainvoke({"query": height_query})
    checks.append({
        "category": "높이제한",
        "query": height_query,
        "answer": height_result['result'],
        "sources": [doc.metadata for doc in height_result['source_documents']],
    })
    
    # 4. 주차 기준
    parking_query = f"연면적 {design_params['land_area'] * design_params['floor_area_ratio'] / 100:.0f}㎡, {design_params['zone_type']}의 법정 주차 대수는? 현재 {design_params['parking_count']}대 계획."
    parking_result = await qa_chain.ainvoke({"query": parking_query})
    checks.append({
        "category": "주차",
        "query": parking_query,
        "answer": parking_result['result'],
        "sources": [doc.metadata for doc in parking_result['source_documents']],
    })
    
    return {
        "design_params": design_params,
        "compliance_checks": checks,
        "timestamp": datetime.now().isoformat(),
    }
```

---

## 4. Multi-Agent 오케스트레이션

### 4-1. CrewAI 기반

```bash
pip install crewai crewai-tools
```

```python
from crewai import Agent, Task, Crew, Process
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(model="gpt-4o", temperature=0)

# ───── Agent 정의 ─────

law_agent = Agent(
    role="건축법규 검토 전문가",
    goal="건축법, 시행령, 지자체 조례를 기반으로 설계안의 적법성을 검토",
    backstory="""한국 건축법에 20년 이상의 경험을 가진 법규 전문가.
    건축법 시행령, 주차장법, 각 지자체 조례를 숙지하고 있으며,
    건축심의 대응 경험이 풍부합니다.""",
    llm=llm,
    verbose=True,
)

site_agent = Agent(
    role="대지 분석 전문가",
    goal="GIS 데이터와 현장 분석을 통해 대지의 잠재력과 제약 조건을 도출",
    backstory="""GIS와 도시계획 전문가로, 지형·일조·조망·교통 분석에 능합니다.
    Vworld API, 국토정보시스템, 토지이음 데이터를 활용합니다.""",
    llm=llm,
    verbose=True,
)

program_agent = Agent(
    role="건축 프로그램 기획 전문가",
    goal="법규와 대지 분석 결과를 종합하여 최적의 건축 프로그램을 제안",
    backstory="""건축기획 전문가로, 용도별 면적 배분, 층별 구성, 
    수익성 분석, 입주자 니즈 파악에 능합니다.""",
    llm=llm,
    verbose=True,
)

# ───── Task 정의 ─────

law_review_task = Task(
    description="""
    다음 설계 조건에 대해 법규 적합성을 검토하세요:
    
    주소: {address}
    용도지역: {zone_type}
    대지면적: {land_area}㎡
    건폐율: {building_coverage}%
    용적률: {floor_area_ratio}%
    
    검토 항목: 건폐율, 용적률, 높이제한, 일조권, 주차, 건축선후퇴
    각 항목별로 적합/부적합 판정과 근거 법조문을 명시하세요.
    """,
    expected_output="법규 적합성 보고서 (항목별 판정 + 근거)",
    agent=law_agent,
)

site_analysis_task = Task(
    description="""
    법규 검토 결과를 참고하여 대지의 개발 잠재력을 분석하세요:
    
    {law_review_output}
    
    분석 항목:
    1. 건축 가능 면적 (법정 건폐율 기준)
    2. 최대 연면적 (법정 용적률 기준)
    3. 최적 층수 배분 (상업/주거)
    4. 일조 및 조망 방향
    5. 주차장 배치 제안
    """,
    expected_output="대지 분석 보고서 + 개발 가능 규모",
    agent=site_agent,
    context=[law_review_task],  # 법규 검토 결과 참조
)

program_task = Task(
    description="""
    법규 검토와 대지 분석 결과를 종합하여 최적 건축 프로그램을 제안하세요.
    
    포함 항목:
    1. 용도별 면적 배분표
    2. 층별 프로그램 (지하~최상층)
    3. 예상 수익성 분석
    4. 차별화 전략
    """,
    expected_output="건축 프로그램 기획서 (면적표 + 층별 구성 + 수익 분석)",
    agent=program_agent,
    context=[law_review_task, site_analysis_task],
)

# ───── Crew 실행 ─────

crew = Crew(
    agents=[law_agent, site_agent, program_agent],
    tasks=[law_review_task, site_analysis_task, program_task],
    process=Process.sequential,  # 순차 실행
    verbose=True,
)

# 실행
result = crew.kickoff(inputs={
    "address": "서울시 강남구 역삼동 123-45",
    "zone_type": "제3종 일반주거지역",
    "land_area": 330,
    "building_coverage": 55,
    "floor_area_ratio": 250,
})
```

### 4-2. LangChain Agent (Tool 기반)

```python
from langchain.agents import AgentExecutor, create_openai_functions_agent
from langchain.tools import tool

@tool
def search_building_law(query: str) -> str:
    """건축법 시행령에서 관련 조문을 검색합니다."""
    docs = law_vectorstore.similarity_search(query, k=3)
    return "\n\n".join([doc.page_content for doc in docs])

@tool
def search_local_ordinance(zone_type: str, municipality: str) -> str:
    """특정 지자체의 용도지역별 조례를 검색합니다."""
    query = f"{municipality} {zone_type} 건축 조례 건폐율 용적률"
    docs = ordinance_vectorstore.similarity_search(query, k=3)
    return "\n\n".join([doc.page_content for doc in docs])

@tool
def calculate_building_capacity(land_area: float, bcr: float, far: float, floor_height: float = 3.3) -> str:
    """법규 기준으로 건축 가능 규모를 계산합니다."""
    max_footprint = land_area * (bcr / 100)
    max_gross_area = land_area * (far / 100)
    max_floors = int(max_gross_area / max_footprint) if max_footprint > 0 else 0
    max_height = max_floors * floor_height
    
    return f"""
    건축면적 (최대): {max_footprint:.1f}㎡
    연면적 (최대): {max_gross_area:.1f}㎡
    최대 층수: {max_floors}층
    최대 높이: {max_height:.1f}m
    """

@tool
def search_design_cases(building_type: str, area_range: str) -> str:
    """유사 규모·용도의 과거 당선작을 검색합니다."""
    query = f"{building_type} {area_range} 현상설계 당선작"
    docs = case_vectorstore.similarity_search(query, k=3)
    return "\n\n".join([doc.page_content for doc in docs])

# Agent 생성
tools = [search_building_law, search_local_ordinance, calculate_building_capacity, search_design_cases]

agent = create_openai_functions_agent(
    llm=ChatOpenAI(model="gpt-4o"),
    tools=tools,
    prompt=hub.pull("hwchase17/openai-functions-agent"),
)

agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True)
```

---

## 5. API 서버 (FastAPI)

```python
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="건축기획 AI 법규 검토 API")

class DesignCheckRequest(BaseModel):
    address: str
    zone_type: str
    land_area: float
    building_coverage: float
    floor_area_ratio: float
    total_floors: int
    building_height: float

@app.post("/api/compliance-check")
async def compliance_check(req: DesignCheckRequest):
    """설계안 법규 적합성 검토"""
    result = await check_design_compliance(req.dict(), qa_chain)
    return result

@app.post("/api/design-program")
async def generate_program(req: DesignCheckRequest):
    """AI 기반 건축 프로그램 생성"""
    result = crew.kickoff(inputs=req.dict())
    return {"program": result}

@app.get("/api/search-law")
async def search_law(q: str):
    """건축법 검색"""
    docs = law_vectorstore.similarity_search(q, k=5)
    return {"results": [{"content": d.page_content, "metadata": d.metadata} for d in docs]}
```

---

## 6. 데이터 소스

### 건축법 데이터 수집처

| 소스 | URL | 데이터 |
|------|-----|--------|
| 국가법령정보센터 | law.go.kr | 건축법, 시행령, 시행규칙 |
| 자치법규정보시스템 | elis.go.kr | 지자체 조례 |
| 토지이음 | eum.go.kr | 토지이용계획 |
| 건축행정시스템 (세움터) | cloud.eais.go.kr | 건축 인허가 |
| 국토교통부 | molit.go.kr | 정책·고시 |

### 수집 자동화

```python
import requests
from bs4 import BeautifulSoup

def crawl_building_law(law_id: str = "002353") -> list[dict]:
    """
    국가법령정보센터에서 건축법 조문 크롤링
    law_id: 002353 (건축법), 003800 (건축법 시행령)
    """
    url = f"https://www.law.go.kr/법령/건축법"
    # Note: 실제 구현 시 API 활용 권장
    # law.go.kr/DRF/lawSearch.do?target=law&type=XML
    ...
```

---

## 체크리스트

- [ ] ChromaDB 로컬 설치 및 테스트
- [ ] 건축법 시행령 텍스트 수집 (법령 API)
- [ ] 텍스트 청킹 + 임베딩 인덱싱
- [ ] RAG Q&A 체인 구축
- [ ] 설계안 법규 적합성 자동 검토
- [ ] CrewAI Multi-Agent 설정
- [ ] 지자체 조례 데이터 수집
- [ ] FastAPI 서버 구축
- [ ] 프론트엔드 챗봇 UI 연동
- [ ] 과거 당선작 데이터 벡터화
