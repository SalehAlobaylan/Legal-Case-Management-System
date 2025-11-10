<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# hey, we have a graduation project,

we are 3 student,

- fullstack Software Engineer / backend developer [Nodejs] (me)
- Flutter developer
- Data science and AI

we will build a project about case managment system, the system will featured Regulation_Change_Monitor
to track the legal regulations and alert the user if something changed,
but the main feature is linking the legal cases with the related regulation using AI in the dashboard
what should we use technologies and requirements?
and all things we need
like what model we should use and languages or frameworks and system or services we should connect with,
this some of details we think of for it:
*Techs:
NestJS (NodeJS) | Flutter (Dart) | (FastAPI) Python
Postgres, Redis, MongoDB
MinIO?
Docker, Vercel,
WebScoket, RestfulAPIs
Security: JWT, OAuth

Consider this chat for what Gemini 2.5 Pro respond me about same idea:

Here's a breakdown of the technologies, architecture, and workflow you'll need.

🏛️ High-Level Technology Stack

Backend: Node.js with the Express.js framework.

Mobile App: Flutter.
Database: PostgreSQL (it's robust and has great full-text search and JSON handling capabilities).

AI/ML: Python with Flask or FastAPI to serve the model.
Communication: REST APIs for communication between the app, backend, and AI service. WebSockets for real-time alerts.
Deployment: Docker to containerize your services, making them easy to manage and deploy.

🧑‍💻 Breakdown by Team Member Role

Here’s what each of you will focus on.

1. Full-Stack / Backend Developer (You)

Your job is the central hub, connecting everything.
Framework: Node.js with Express.js or NestJS. NestJS is more structured and uses TypeScript, which can be great for a larger project.

Database Management: Use an ORM (Object-Relational Mapper) like Prisma or Sequelize to interact with your PostgreSQL database. This simplifies database operations.

APIs:
REST API: Create endpoints for user authentication (login/register), case management (Create, Read, Update, Delete - CRUD), and managing regulations.
API Gateway: You will call the Python AI service from your Node.js backend to get the AI-powered links. The Flutter app should only talk to your Node.js server, not directly to the AI service.
Authentication: Use JSON Web Tokens (JWT) for securing your APIs.

Regulation Change Monitor:
Scraping: Use a library like Puppeteer or Cheerio to scrape legal websites for regulation text.
Scheduling: Run this scraper periodically using a scheduler like node-cron.
Change Detection: A simple way to detect changes is to calculate a hash (e.g., MD5 or SHA256) of the regulation's content. Store the hash in your database. If the new scrape results in a different hash, the regulation has changed.
Real-time Alerts: Implement WebSockets (using a library like socket.io) to push notifications to the Flutter app instantly when a regulation change is detected.

2. Flutter Developer

Your focus is on creating a smooth and intuitive user experience.
Framework: Flutter with the Dart language.
State Management: Choose a state management solution like Provider, BLoC, or Riverpod. Provider is generally the simplest to start with.
Networking: Use the http or dio package to make API calls to the Node.js backend.

UI/UX:
Design and build the user interface for login, registration, and the main dashboard.
Create a view to display a list of legal cases.
Design the case detail screen where the magic happens: show the case information and the AI-suggested list of related regulations.
Implement a real-time notification system to receive and display alerts from the WebSocket server.

Local Storage: Use shared_preferences or a local database like sqflite to store the user's auth token (JWT).

3. Data Science and AI Specialist

Your role is to build the core intelligence of the application. The main task is semantic search.
Language: Python.
Core Libraries:
transformers by Hugging Face: This is your most important tool. It gives you access to state-of-the-art NLP models.
sentence-transformers: A library built on top of transformers that is specifically designed for creating sentence and text embeddings.
PyTorch or TensorFlow: The backend frameworks for the models.
NLTK or spaCy: For basic text cleaning and preprocessing.

scikit-learn: For calculating similarity scores.

AI Model \& Approach: Sentence Embeddings This is a perfect use case for sentence embeddings, not traditional classification. The goal is to find the most similar regulations to a given case summary.
Choose a Pre-trained Model: You don't need to train a model from scratch. Use a pre-trained model like all-MiniLM-L6-v2 or all-mpnet-base-v2 from sentence-transformers.These models are excellent at understanding the semantic meaning of text.

Generate Embeddings:
First, gather all the legal regulations (from the scraper).
Use the chosen model to convert the text of every single regulation into a numerical vector (an "embedding"). This is a one-time process (or you re-run it when regulations are updated).
Store these embeddings. For a student project, you can store them in a file. For a more advanced solution, you'd use a Vector Database like Pinecone, ChromaDB, or FAISS (from Facebook AI).
The Matching Process (Inference):
When a user views a case, the backend sends the case's text/summary to your AI service.
Your service converts this new case text into an embedding using the same model.
It then calculates the cosine similarity between the case embedding and all the stored regulation embeddings.
The regulations with the highest similarity scores (e.g., the top 5) are the most relevant. Your service returns the IDs of these regulations.
Serving the Model: Wrap this logic in a simple web server using Flask or FastAPI. It will have one main endpoint, e.g., /find_related_regulations, that accepts case text and returns a list of regulation IDs.

⚙️ System Architecture \& Data Flow

Here's how they all connect:
Regulation Monitoring (Automated Task):
The Node.js node-cron job runs.
Puppeteer/Cheerio scrapes the legal websites.
It compares the new content hash with the old hash in the PostgreSQL DB.
If a change is detected, it updates the DB and sends a message via WebSocket to active Flutter clients.
AI-Powered Linking (User-driven):
The user opens a case in the Flutter App.
The Flutter App calls the Node.js Backend API (/cases/{id}).
The Node.js backend retrieves the case details from the PostgreSQL DB.
The Node.js backend then makes an API call to the Python AI Service (/find_related_regulations), sending the case summary.
The Python AI Service computes the embeddings, finds the top N most similar regulations, and returns their IDs.
The Node.js backend fetches the full text of those regulations from the DB and sends the complete case data + related regulations back to the Flutter app.
The Flutter app displays everything to the user.
Good luck with your project! It's an impressive and highly practical idea.
المصادر
shouldn't we use nest.js instead of express?
عرض طريقة التفكير
That's an excellent question, and you're right to ask it. For your project, using Nest.js is a fantastic idea and likely a better choice than plain Express.js.
While my initial suggestion of Express is perfectly valid (it's the foundation), Nest.js is a framework built on top of Express that solves many of its challenges, especially for team projects.

Here’s a breakdown of why you should strongly consider Nest.js.

Express.js: The Flexible Toolkit 🧰

Think of Express.js as a box of high-quality tools. It gives you the bare essentials (routing, middleware) and lets you build your application however you want.

Pros:
Minimalist: Very small and easy to get a "Hello World" running in minutes.

Flexible: You have complete freedom to choose your own architecture and libraries.

Cons (Especially for a team project):
Unopinionated: This freedom can lead to chaos. Without a strong, experienced lead setting strict rules, your codebase can become messy and inconsistent.
Boilerplate: You have to set up everything yourself: folder structure, configuration, validation, and architectural patterns.

Nest.js: The Architectural Blueprint 🏗️

Think of Nest.js as a professional architectural blueprint for your application. It uses those same high-quality tools (like Express) but organizes them into a predictable, scalable, and efficient structure.
Pros (Why it's better for your project):
Clear, Scalable Architecture: Nest.js enforces a structure of Modules, Controllers, and Services. This means everyone on the team knows exactly where to find code and where to write new code. This is a huge advantage for collaboration.

TypeScript by Default: This provides strong typing, which catches bugs before you even run the code and makes autocompletion in your editor incredibly helpful. It makes your API contracts clear for the Flutter developer.
Dependency Injection: A core concept that makes your code modular, easier to manage, and much simpler to test.

Built-in Solutions: It comes with pre-built solutions for common problems like validation, configuration management, logging, and database integration (e.g., TypeORM).

Automatic API Documentation: With a few lines of code, Nest.js can automatically generate Swagger (OpenAPI) documentation for your API. This is a massive benefit for your Flutter developer, who will have a live, interactive guide to your backend endpoints.

Final Verdict

For a solo developer building a quick prototype, Express.js is great.
For a 3-person graduation project where you need to work together efficiently and build a robust application, Nest.js is the superior choice. It will force you to write clean, organized, and maintainable code from day one. The initial learning curve is slightly steeper than Express, but it will save you countless hours of confusion and refactoring down the line.
Recommendation: Go with Nest.js. The structure it provides will be invaluable for coordinating between the backend, frontend (Flutter), and AI services.

Yes—use NestJS for the backend, PostgreSQL with pgvector for data and semantic search, a Python FastAPI microservice for embeddings and similarity, Flutter for clients, WebSockets (Socket.IO) for real-time alerts, and optionally MinIO for storing regulation documents and PDFs. For AI, start with the sentence-transformers all-MiniLM-L6-v2 for speed or BGE-M3 for multilingual text, and store vectors either in Postgres via pgvector or in a dedicated vector DB like Qdrant.[^1_1][^1_2][^1_3][^1_4][^1_5][^1_6][^1_7][^1_8]

## Architecture

- Backend service: NestJS (TypeScript) exposes REST endpoints for auth, case/regulation CRUD, monitoring orchestration, and serves WebSocket events for change alerts and dashboard updates.[^1_5][^1_7]
- AI microservice: FastAPI serves endpoints for embed(text) and find_related(case_text) using sentence-transformers and returns top-N regulation IDs with scores.[^1_2][^1_4]
- Data layer: PostgreSQL holds normalized entities, full‑text indexes via tsvector/tsquery for keyword search, and pgvector columns for similarity search; optional MinIO stores raw artifacts (PDF/HTML).[^1_9][^1_3][^1_8]
- Vector store: Start with pgvector in Postgres for simplicity; consider Qdrant later for higher‑throughput vector search and hybrid retrieval.[^1_3][^1_6]


## Backend stack

- NestJS modules/controllers/services give a clean domain structure with DI, strong typing, and easy scaling for a 3‑person team, plus straightforward OpenAPI docs generation.[^1_5]
- Real‑time alerts: Socket.IO WebSockets channel “regulation_updates” to push change notifications and AI link refresh events to active clients.[^1_7]
- Search: Use PostgreSQL full‑text search via tsvector/tsquery for keyword queries, and pgvector for semantic similarity across cases and regulations.[^1_9][^1_3]


## AI service

- Framework: FastAPI for a lightweight, typed, async model-serving API with automatic OpenAPI docs and OAuth2 helpers if needed.[^1_2]
- Embeddings: all‑MiniLM‑L6‑v2 (384‑dim) for fast, general semantic search; if multilingual regulations are expected, prefer BGE‑M3 for >100 languages and long‑context support.[^1_4][^1_1]
- Ranking pipeline: Retrieve top‑K by embeddings, then optionally re‑rank using BGE team’s recommended hybrid retrieval + re‑ranking approach for higher precision.[^1_1]


## Storage and search

- PostgreSQL: Use tsvector/tsquery for robust full‑text search and ranking of regulation and case text, with GIN indexes for performance.[^1_9]
- Vectors: Add a vector(384) or vector(768) column via pgvector; create HNSW or IVF indexes for approximate nearest neighbor search inside Postgres.[^1_3]
- External vector DB: If scale demands, Qdrant offers fast vector search with payload filters and hybrid retrieval options via REST/SDKs.[^1_6]
- Artifacts: Store fetched HTML/PDF snapshots and attachments in MinIO (S3‑compatible) to keep the database lean and enable versioned storage later.[^1_8]


## Regulation change monitor

- Collection: Periodic fetchers retrieve regulation pages or feeds; extracted text is normalized and stored with a version row referencing the regulation.[^1_9]
- Detection: Compute a content signature, compare to the last version, persist a new version when changed, and emit a WebSocket event to clients for immediate visibility.[^1_7]
- Indexing: On change, update tsvector and embeddings so full‑text and semantic search results reflect the latest regulation state.[^1_3][^1_9]


## Security

- AuthN/AuthZ: Use JWT access tokens for API access and role‑based guards in NestJS; OAuth2 flows are available via FastAPI or gateway as needed.[^1_2][^1_5]
- API docs: Auto‑generate OpenAPI for both services to aid the Flutter client integration and testing.[^1_5][^1_2]


## Mobile app

- Flutter: Use REST for CRUD and viewing details and maintain a persistent WebSocket (Socket.IO client) for live alerts when regulations change or new AI links are available.[^1_7][^1_2]
- Token handling: Store JWT securely on device and attach to API and WebSocket connections for authenticated traffic.[^1_7]


## Why NestJS over Express

- NestJS enforces a modular, testable architecture with DI and TypeScript, which helps a small team maintain consistency, documentation, and velocity across domains like auth, monitoring, and AI orchestration.[^1_5]
- Its opinionated structure (modules/controllers/providers) and tooling reduce boilerplate and improve collaboration compared to unopinionated Express setups for multi‑module backends.[^1_5]


## Data model (core tables)

- regulations: id, title, source_url, current_version_id, full_text(tsvector), embedding(vector), metadata.[^1_3][^1_9]
- regulation_versions: id, regulation_id, fetched_at, checksum, text_snapshot, diff_summary, artifact_uri (MinIO).[^1_8]
- cases: id, title, body, full_text(tsvector), embedding(vector), metadata.[^1_9][^1_3]
- case_regulation_links: case_id, regulation_id, score, method (ai/manual).[^1_3]
- users/roles: id, role, org for RBAC and multi‑tenant scoping.[^1_5]


## Model choices (quick compare)

| Model | Strength | Notes |
| :-- | :-- | :-- |
| all‑MiniLM‑L6‑v2 | Fast, 384‑dim for semantic search | Good quality with high throughput for student projects [^1_4][^1_10]. |
| all‑mpnet‑base‑v2 | Higher accuracy, 768‑dim | Heavier compute; better quality if latency is acceptable [^1_10][^1_11]. |
| BGE‑M3 | Multilingual, hybrid retrieval, long input | >100 languages and 8192 tokens; supports hybrid retrieval and re‑ranking workflows [^1_1][^1_12]. |

## Minimal MVP roadmap

- Week 1–2: Scaffold NestJS, FastAPI, and Postgres; define schemas and enable tsvector and pgvector extensions.[^1_9][^1_3][^1_5]
- Week 3: Implement CRUD for cases/regulations, embed ingestion with all‑MiniLM‑L6‑v2, build top‑K semantic linking endpoint in FastAPI.[^1_4][^1_2]
- Week 4: Add WebSocket alerts and a simple monitor that fetches target regulation URLs, stores text snapshots, and notifies on change.[^1_7]
- Week 5: Integrate Flutter client with REST + WebSocket, display related regulations with scores and allow manual override.[^1_2][^1_7]
- Week 6: Add full‑text search (tsvector) and optional hybrid ranking with a re‑ranking step for improved precision.[^1_1][^1_9]


## Optional scale-ups

- Swap or augment vector search with Qdrant when corpus grows and latency matters, using its filtering and hybrid capabilities.[^1_6]
- Store all artifacts in MinIO with bucket policies and lifecycle rules for versioning and retention as datasets expand.[^1_8]


## Concrete tech checklist

- Backend: NestJS (TS), REST + WebSockets (Socket.IO), OpenAPI docs.[^1_7][^1_5]
- AI: FastAPI, sentence-transformers, all‑MiniLM‑L6‑v2 or BGE‑M3, optional re‑ranker.[^1_4][^1_1][^1_2]
- DB: PostgreSQL with full‑text (tsvector/tsquery) and pgvector for embeddings.[^1_3][^1_9]
- Vector DB (optional): Qdrant for high‑throughput similarity search and filters.[^1_6]
- Storage: MinIO for PDFs/HTML and large files.[^1_8]

If the corpus is multilingual or includes Arabic regulations, prefer the BGE‑M3 pipeline for stronger cross‑lingual matching, and keep pgvector or Qdrant tuned to the model’s embedding dimension and metric (cosine) for accurate retrieval.[^1_1][^1_3]
<span style="display:none">[^1_13][^1_14][^1_15][^1_16][^1_17][^1_18][^1_19][^1_20][^1_21][^1_22][^1_23][^1_24][^1_25][^1_26][^1_27][^1_28][^1_29][^1_30][^1_31][^1_32][^1_33][^1_34][^1_35][^1_36][^1_37][^1_38][^1_39][^1_40][^1_41][^1_42][^1_43][^1_44][^1_45][^1_46][^1_47][^1_48][^1_49][^1_50][^1_51][^1_52][^1_53][^1_54][^1_55][^1_56][^1_57][^1_58][^1_59][^1_60]</span>

<div align="center">⁂</div>

[^1_1]: https://huggingface.co/BAAI/bge-m3

[^1_2]: https://fastapi.tiangolo.com

[^1_3]: https://github.com/pgvector/pgvector

[^1_4]: https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2

[^1_5]: https://docs.nestjs.com

[^1_6]: https://qdrant.tech/documentation/

[^1_7]: https://socket.io/docs/v4/

[^1_8]: https://charts.min.io

[^1_9]: https://www.postgresql.org/docs/current/datatype-textsearch.html

[^1_10]: https://www.sbert.net/docs/sentence_transformer/pretrained_models.html

[^1_11]: https://milvus.io/ai-quick-reference/what-are-some-popular-pretrained-sentence-transformer-models-and-how-do-they-differ-for-example-allminilml6v2-vs-allmpnetbasev2

[^1_12]: https://bge-model.com/bge/bge_m3.html

[^1_13]: https://www.postgresql.org/docs/current/textsearch-controls.html

[^1_14]: https://neon.com/postgresql/postgresql-indexes/postgresql-full-text-search

[^1_15]: https://www.instaclustr.com/blog/postgresql-full-text-search/

[^1_16]: https://neon.com/docs/data-types/tsvector

[^1_17]: https://www.geeksforgeeks.org/python/fastapi-introduction/

[^1_18]: https://www.reddit.com/r/PostgreSQL/comments/1f0w4fe/tsvector_advice/

[^1_19]: https://apidog.com/blog/fastapi-documentation/

[^1_20]: https://xata.io/blog/postgres-full-text-search-engine

[^1_21]: https://arxiv.org/abs/2402.03216

[^1_22]: https://orm.drizzle.team/docs/guides/postgresql-full-text-search

[^1_23]: https://devdocs.io/fastapi/

[^1_24]: https://ollama.com/library/bge-m3

[^1_25]: https://fastapi-tutorial.readthedocs.io

[^1_26]: https://milvus.io/docs/embed-with-bgm-m3.md

[^1_27]: https://github.com/fastapi

[^1_28]: https://zilliz.com/ai-models/bge-m3

[^1_29]: https://www.tigerdata.com/blog/postgresql-as-a-vector-database-using-pgvector

[^1_30]: https://python.langchain.com/docs/integrations/vectorstores/pgvector/

[^1_31]: https://www.tigerdata.com/learn/postgresql-extensions-pgvector

[^1_32]: https://docs.spring.io/spring-ai/reference/api/vectordbs/pgvector.html

[^1_33]: https://www.freecodecamp.org/news/the-nestjs-handbook-learn-to-use-nest-with-code-examples/

[^1_34]: https://supabase.com/docs/guides/database/extensions/pgvector

[^1_35]: https://dataloop.ai/library/model/sentence-transformers_all-minilm-l6-v2/

[^1_36]: https://www.postgresql.org/about/news/pgvector-050-released-2700/

[^1_37]: https://nestjs.com

[^1_38]: https://docs.voxel51.com/integrations/pgvector.html

[^1_39]: https://github.com/nestjs/docs.nestjs.com

[^1_40]: https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/tree/main

[^1_41]: https://www.nestjs-trpc.io/docs/nestjs

[^1_42]: https://github.com/UKPLab/sentence-transformers/issues/3298

[^1_43]: https://dev.to/munisekharudavalapati/node-js-documentation-1-1k7a

[^1_44]: https://qdrant.tech

[^1_45]: https://python-client.qdrant.tech

[^1_46]: https://api.qdrant.tech/api-reference

[^1_47]: https://python.langchain.com/docs/integrations/vectorstores/qdrant/

[^1_48]: https://socket.io/docs/v3/server-api/

[^1_49]: https://github.com/minio/docs

[^1_50]: https://airbyte.com/tutorials/beginners-guide-to-qdrant

[^1_51]: https://github.com/qdrant/qdrant

[^1_52]: https://socket.io/docs/v3/

[^1_53]: https://docs.min.io/enterprise/aistor-object-store/

[^1_54]: https://qdrant.tech/qdrant-vector-database/

[^1_55]: https://socket.io

[^1_56]: https://docs.min.io/community/minio-object-store/index.html

[^1_57]: https://github.com/qdrant/docs

[^1_58]: https://devdocs.io/socketio/

[^1_59]: https://docs.min.io/community/minio-kes/

[^1_60]: https://qdrant.github.io/qdrant/redoc/index.html


---

# What NLP models are best for semantic similarity detection in legal texts

The strongest options are domain‑specific legal encoders like Legal‑BERT for English legal corpora, multilingual BGE‑M3 when texts span languages, and robust sentence‑transformer baselines such as all‑MiniLM‑L6‑v2 or all‑mpnet‑base‑v2; for top precision, combine dense retrieval with a cross‑encoder re‑ranker and optionally a late‑interaction retriever like ColBERTv2. In practice, start with embeddings for fast top‑K recall, then re‑rank the candidates to maximize relevance for legal tasks like precedent linking or statute matching.[^2_1][^2_2][^2_3][^2_4][^2_5][^2_6]

## Top picks by scenario

- English legal corpora: Use Legal‑BERT variants (e.g., nlpaueb/legal‑bert‑base‑uncased) pre‑trained on statutes, case law, and contracts, which outperform generic BERT on legal tasks and are well‑documented for legal NLP use.[^2_1]
- Indian legal texts: InLegalBERT extends Legal‑BERT with millions of Indian court decisions and improves state‑of‑the‑art on Indian legal benchmarks, making it a strong choice for Indian jurisdictions.[^2_7]
- Multilingual regulations/case law: BGE‑M3 provides multilingual, multi‑function embeddings with long‑context support, making it suitable when cross‑lingual similarity is needed across jurisdictions.[^2_5]
- Lightweight, general baseline: all‑MiniLM‑L6‑v2 (384‑dim) offers fast, high‑quality sentence embeddings widely used for semantic search and clustering in production‑like settings.[^2_3]
- Higher‑accuracy baseline: all‑mpnet‑base‑v2 (768‑dim) is a strong general embedding model often outperforming lighter models when latency allows, as summarized in sentence‑transformers resources.[^2_6]


## Retrieval and ranking stack

- Dense embeddings (first‑stage): Sentence‑transformers models convert clauses/paragraphs into vectors to retrieve semantically close statutes, rulings, or clauses even with vocabulary mismatch.[^2_3]
- Re‑ranking (second‑stage): A cross‑encoder such as ms‑marco‑MiniLM‑L6‑v2 scores query–document pairs directly and reliably boosts precision at the top ranks in legal search pipelines.[^2_8][^2_2]
- Late‑interaction retrievers: ColBERTv2 computes token‑level interactions for high‑quality ranking, achieving state‑of‑the‑art retrieval effectiveness with a modest storage footprint compared to earlier late‑interaction methods.[^2_4][^2_9]
- Sparse neural retrievers: SPLADE v2 learns term expansion and weights, improving lexical coverage and pairing well with dense retrievers in hybrid setups for complex legal phrasing.[^2_10][^2_11]


## Evidence from legal NLP

- Legal‑BERT model cards report consistent gains over generic BERT on legal tasks across legislation, case law, and contracts, reflecting the value of domain‑specific pretraining for legal semantics.[^2_1]
- Sentence‑embedding methods have been shown to accelerate legal annotation by surfacing semantically similar sentences that often share labels, demonstrating their suitability for legal similarity detection workflows.[^2_12]


## Practical recommendations

- Prefer domain‑specific embeddings when available: use Legal‑BERT variants for English‑language legal corpora, or InLegalBERT for Indian legal texts; use BGE‑M3 when multilingual coverage is required.[^2_7][^2_5][^2_1]
- Start with a dense retriever such as all‑MiniLM‑L6‑v2 or all‑mpnet‑base‑v2, then add a cross‑encoder re‑ranker (ms‑marco‑MiniLM‑L6‑v2) to improve precision at top‑K for case–statute linking or regulation matching.[^2_2][^2_6][^2_3]
- At larger scales or for maximal quality, consider late‑interaction ColBERTv2 or a hybrid dense+sparse pipeline (e.g., SPLADE + dense embeddings) to handle nuanced legal phrasing and long documents.[^2_11][^2_4]


## Quick comparison

| Model | Type | Best for | Notes |
| :-- | :-- | :-- | :-- |
| Legal‑BERT (nlpaueb) | Domain encoder | English legal corpora | Pretrained on statutes, cases, contracts; better than generic BERT on legal tasks [^2_1]. |
| InLegalBERT | Domain encoder | Indian legal texts | Trained on 5.4M Indian cases; improves Indian legal benchmarks [^2_7]. |
| BGE‑M3 | Multilingual embeddings | Cross‑lingual legal text | Multilingual, long‑context, hybrid retrieval friendly [^2_5]. |
| all‑MiniLM‑L6‑v2 | Sentence‑transformer | Fast baseline | 384‑dim embeddings for efficient semantic search [^2_3]. |
| all‑mpnet‑base‑v2 | Sentence‑transformer | Accuracy‑oriented baseline | Strong general performance if latency permits [^2_6]. |
| ms‑marco‑MiniLM‑L6‑v2 | Cross‑encoder | Re‑ranking top‑K | Trained on passage ranking; boosts top‑rank precision [^2_8][^2_2]. |
| ColBERTv2 | Late interaction | High‑quality ranking | Token‑level interactions; SOTA retrieval effectiveness [^2_4][^2_9]. |
| SPLADE v2 | Sparse neural | Hybrid retrieval | Learnable term expansion; complements dense models [^2_11][^2_10]. |

<span style="display:none">[^2_13][^2_14][^2_15][^2_16][^2_17][^2_18][^2_19][^2_20][^2_21][^2_22][^2_23][^2_24][^2_25][^2_26][^2_27][^2_28][^2_29][^2_30][^2_31][^2_32][^2_33][^2_34][^2_35][^2_36][^2_37][^2_38][^2_39][^2_40][^2_41][^2_42]</span>

<div align="center">⁂</div>

[^2_1]: https://huggingface.co/nlpaueb/legal-bert-base-uncased

[^2_2]: https://www.sbert.net/docs/pretrained-models/ce-msmarco.html

[^2_3]: https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2

[^2_4]: https://aclanthology.org/2022.naacl-main.272.pdf

[^2_5]: https://huggingface.co/BAAI/bge-m3

[^2_6]: https://www.sbert.net/docs/sentence_transformer/pretrained_models.html

[^2_7]: https://huggingface.co/law-ai/InLegalBERT

[^2_8]: https://huggingface.co/cross-encoder/ms-marco-MiniLM-L6-v2

[^2_9]: https://aclanthology.org/2022.naacl-main.272/

[^2_10]: https://www.pinecone.io/learn/splade/

[^2_11]: https://arxiv.org/abs/2109.10086

[^2_12]: https://arxiv.org/abs/2112.11494

[^2_13]: https://huggingface.co/casehold/legalbert

[^2_14]: https://huggingface.co/models?other=legal

[^2_15]: https://opensource.legal/projects/Legal_BERT

[^2_16]: https://ai.azure.com/catalog/models/law-ai-inlegalbert

[^2_17]: https://milvus.io/ai-quick-reference/how-could-a-legal-tech-application-utilize-sentence-transformers-perhaps-to-find-similar-case-law-documents-or-contracts

[^2_18]: https://huggingface.co/jhu-clsp/LegalBert

[^2_19]: https://cy.linkedin.com/posts/anoopkunchukuttan_law-aiinlegalbert-hugging-face-activity-6977188097050497024-iohD

[^2_20]: https://milvus.io/ai-quick-reference/what-are-embeddings-in-the-context-of-legal-documents

[^2_21]: https://huggingface.co/casehold/custom-legalbert

[^2_22]: https://huggingface.co/xshubhamx/InLegalBERT

[^2_23]: https://huggingface.co/sethanimesh/legal-bert

[^2_24]: https://huggingface.co/kinshuk-h/InLegalBERT-cbp-lkg-finetuned

[^2_25]: https://arxiv.org/html/2411.07739v1

[^2_26]: https://huggingface.co/felipemaiapolo/legalnlp-bert

[^2_27]: https://huggingface.co/legal-text-classification/IndianLegalBERT

[^2_28]: https://fastdatascience.com/natural-language-processing/semantic-similarity-with-sentence-embeddings/

[^2_29]: https://huggingface.co/pile-of-law/legalbert-large-1.7M-2

[^2_30]: https://sbert.net/docs/cross_encoder/pretrained_models.html

[^2_31]: https://github.com/UKPLab/sentence-transformers/issues/1353

[^2_32]: https://sbert.net/docs/cross_encoder/usage/efficiency.html

[^2_33]: https://github.com/UKPLab/sentence-transformers/issues/2874

[^2_34]: https://arxiv.org/abs/2112.01488

[^2_35]: https://arxiv.org/abs/2107.05720

[^2_36]: https://dataloop.ai/library/model/cross-encoder_ms-marco-minilm-l-6-v2/

[^2_37]: https://arxiv.org/abs/2408.16672

[^2_38]: https://dl.acm.org/doi/10.1145/3404835.3463098

[^2_39]: https://hub.docker.com/layers/semitechnologies/reranker-transformers/cross-encoder-ms-marco-MiniLM-L-6-v2-1.1.0/images/sha256-7ec3c9795866664bd4cf1c5a9bc4de92830658c69c88eef85f93d10da267199a

[^2_40]: https://huggingface.co/colbert-ir/colbertv2.0

[^2_41]: https://github.com/naver/splade

[^2_42]: https://learn.microsoft.com/en-us/answers/questions/2109623/issues-with-cross-encoder-ms-marco-minilm-l-12-mod


---

# we want it for Saudi Arabia courts

For Saudi courts, the best starting point is a domain‑specific Arabic legal model like AraLegal‑BERT for Arabic legal text, paired with a strong multilingual sentence‑embedding model (e.g., LaBSE, multilingual‑E5, or paraphrase‑multilingual‑mpnet) and a cross‑encoder re‑ranker for top‑K precision; if cross‑lingual or long‑context matching is needed across Arabic/English sources, consider the multilingual **BGE‑M3** family for embeddings and hybrid retrieval workflows. This combination yields high recall via dense embeddings in Arabic and boosts legal relevance at the top ranks via re‑ranking, which is crucial for case–statute and case–regulation similarity in KSA contexts.[^3_1][^3_2][^3_3][^3_4][^3_5][^3_6][^3_7][^3_8][^3_9]

## Recommended models

- Domain Arabic legal: AraLegal‑BERT was trained on 336K KSA/Gulf cases plus laws/regulations and outperforms generic Arabic BERT baselines on Arabic legal tasks, making it a strong encoder backbone for Saudi jurisprudence semantics.[^3_2][^3_10][^3_1]
- Multilingual Arabic embeddings: LaBSE provides language‑agnostic sentence embeddings across 100+ languages including Arabic and is widely used for cross‑lingual similarity, useful when texts mix Arabic and English sources or translations.[^3_11][^3_3][^3_12]
- Multilingual dense baseline: paraphrase‑multilingual‑mpnet‑base‑v2 is a robust, widely adopted sentence‑transformers model supporting Arabic for semantic search and clustering with 768‑dim embeddings.[^3_13][^3_6]
- Instruction‑tuned multilingual embeddings: multilingual‑E5‑large offers strong cross‑lingual performance (including Arabic), with public evaluations indicating good Arabic accuracy and 1024‑dim embeddings for retrieval.[^3_14][^3_4]
- Advanced multilingual option: BGE‑M3 supports multilingual, multi‑function embeddings and long input windows, enabling hybrid retrieval and improved cross‑lingual legal matching when statutes, regulations, and cases span jurisdictions or languages.[^3_7]
- Arabic SBERT variants: Arabic‑SBERT models (e.g., Arabic‑SBERT‑100K) are sentence‑transformers specifically for Arabic embeddings and can serve as compact baselines or be further fine‑tuned on Saudi legal pairs.[^3_15]


## Re‑ranking and pipeline

- Two‑stage retrieval: Use Arabic/multilingual sentence embeddings for first‑stage dense retrieval (high recall), then apply a cross‑encoder re‑ranker to score query–candidate pairs for top‑K precision in legal similarity.[^3_8][^3_9]
- Cross‑encoder choices: A multilingual cross‑encoder (e.g., mmarco‑mMiniLMv2‑L12‑H384‑v1) has been used to re‑rank Arabic retrieval outputs in shared tasks, and cross‑encoders generally remain highly competitive for precise ranking.[^3_5][^3_16]
- Arabic coverage in STS: Sentence‑Transformers’ multilingual training/evaluation includes Arabic STS, reinforcing the suitability of multilingual encoders and re‑rankers in Arabic semantic similarity pipelines.[^3_17]


## Saudi‑specific data and evaluation

- KSA legal corpora: AraLegal‑BERT’s training includes hundreds of thousands of Saudi and Gulf cases and KSA regulations, with data sources such as the Scientific Judicial Portal of the Saudi Ministry of Justice noted in the paper, aligning closely with Saudi court language and style.[^3_1][^3_2]
- Regulatory/PDPL domain: The Saudi Privacy Policy Dataset (Arabic, PDPL‑aligned) can support auxiliary evaluation or domain adaptation for regulatory similarity, particularly for privacy‑related regulations impacting commercial disputes.[^3_18]
- Task‑adjacent Arabic legal work: Arabic legal NLP studies on court decisions and criminal activity classification indicate transformer models (AraBERT/AraELECTRA variants) are effective foundations for Arabic legal downstream tasks in the region.[^3_19][^3_20]


## Practical setup

- MVP embedding choice: Use a multilingual model covering Arabic with strong retrieval quality (LaBSE or multilingual‑E5‑large) to get reliable Arabic embeddings quickly; if only Arabic is needed, test Arabic‑SBERT variants for latency/throughput wins.[^3_3][^3_4][^3_15]
- Domain adaptation: Further fine‑tune AraLegal‑BERT or the chosen multilingual SBERT on in‑domain Saudi case–statute pairs or case–regulation pairs to improve semantic alignment for KSA jurisprudence.[^3_2][^3_1]
- Cross‑encoder re‑ranking: Integrate a multilingual cross‑encoder in the second stage; community and academic results show consistent top‑K gains over bi‑encoder‑only ranking in Arabic retrieval tasks.[^3_9][^3_5]
- Cross‑lingual needs: When matching Arabic cases to English regulatory summaries or bilingual material, prefer LaBSE, multilingual‑E5, or BGE‑M3 to keep both languages in the same embedding space.[^3_4][^3_3][^3_7]


## Model selection table

| Scenario | Primary embedding | Why | Re‑ranker |
| :-- | :-- | :-- | :-- |
| Pure Arabic, legal domain | AraLegal‑BERT (fine‑tuned to sentence embeddings) | Trained on KSA cases and laws; captures Saudi legal phrasing | Multilingual cross‑encoder (e.g., mmarco mMiniLMv2 L12 H384) [^3_1][^3_2][^3_5] |
| Arabic with occasional English | LaBSE or multilingual‑E5‑large | Strong cross‑lingual sentence space with Arabic support | Multilingual cross‑encoder for precise top‑K [^3_3][^3_4][^3_5] |
| Cross‑jurisdiction, long context | BGE‑M3 | Multilingual, long‑context, hybrid retrieval friendly | Cross‑encoder or late‑interaction where needed [^3_7][^3_9] |
| Lightweight Arabic baseline | Arabic‑SBERT‑100K | Compact Arabic embeddings for fast retrieval | Multilingual cross‑encoder [^3_15][^3_5] |

## Extra notes and resources

- Evidence of KSA coverage: AraLegal‑BERT reports training on Saudi and Gulf legal data, making it a highly relevant backbone for Saudi court similarity tasks and an ideal candidate for further fine‑tuning as a sentence‑embedding model.[^3_1][^3_2]
- Multilingual coverage: LaBSE and Sentence‑Transformers’ multilingual models explicitly include Arabic and are documented for multilingual STS use cases, simplifying cross‑lingual legal retrieval when necessary.[^3_3][^3_17]
- Example Saudi legal model: A Saudi Labour Law Q\&A model fine‑tuned from AraBERT illustrates the feasibility of targeting specific KSA legal domains with Arabic transformers.[^3_21]
<span style="display:none">[^3_22][^3_23][^3_24][^3_25][^3_26][^3_27][^3_28][^3_29][^3_30][^3_31][^3_32][^3_33][^3_34][^3_35][^3_36][^3_37][^3_38][^3_39][^3_40][^3_41][^3_42][^3_43][^3_44][^3_45][^3_46][^3_47][^3_48][^3_49][^3_50][^3_51][^3_52][^3_53][^3_54][^3_55][^3_56][^3_57][^3_58][^3_59][^3_60][^3_61][^3_62]</span>

<div align="center">⁂</div>

[^3_1]: https://aclanthology.org/2022.nllp-1.31.pdf

[^3_2]: https://aclanthology.org/2022.nllp-1.31/

[^3_3]: https://github.com/bojone/labse

[^3_4]: https://huggingface.co/intfloat/multilingual-e5-large

[^3_5]: https://aclanthology.org/2023.arabicnlp-1.80.pdf

[^3_6]: https://huggingface.co/sentence-transformers/paraphrase-multilingual-mpnet-base-v2

[^3_7]: https://huggingface.co/BAAI/bge-m3

[^3_8]: https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2

[^3_9]: https://www.sbert.net/docs/pretrained-models/ce-msmarco.html

[^3_10]: https://arxiv.org/pdf/2210.08284.pdf

[^3_11]: https://huggingface.co/Blaxzter/LaBSE-sentence-embeddings

[^3_12]: https://thesai.org/Downloads/Volume14No11/Paper_135-Semantic_Embeddings_for_Arabic_Retrieval_Augmented_Generation.pdf

[^3_13]: https://dataloop.ai/library/model/sentence-transformers_paraphrase-multilingual-mpnet-base-v2/

[^3_14]: https://huggingface.co/mjwong/multilingual-e5-large-xnli

[^3_15]: https://huggingface.co/akhooli/Arabic-SBERT-100K

[^3_16]: https://arxiv.org/pdf/2403.10407.pdf

[^3_17]: https://sbert.net/examples/sentence_transformer/training/multilingual/README.html

[^3_18]: https://arxiv.org/abs/2304.02757

[^3_19]: https://arxiv.org/pdf/2310.10260.pdf

[^3_20]: http://paper.ijcsns.org/07_book/202109/20210937.pdf

[^3_21]: https://huggingface.co/faisalaljahlan/Labour-Law-SA-QA

[^3_22]: https://arxiv.org/abs/2210.08284

[^3_23]: https://elmeurope.com/publications/aralegal-bert-a-pretrained-language-model-for-arabic-legal-text/

[^3_24]: https://www.academia.edu/91716501/AraLegal_BERT_A_pretrained_language_model_for_Arabic_Legal_text

[^3_25]: https://nlp.johnsnowlabs.com/2022/10/02/legner_arabert_arabic_ar.html

[^3_26]: https://thesai.org/Downloads/Volume16No5/Paper_44-Fine_Tuning_Arabic_and_Multilingual_BERT_Models.pdf

[^3_27]: https://sdaia.gov.sa/en

[^3_28]: https://deepai.org/publication/arabert-transformer-based-model-for-arabic-language-understanding

[^3_29]: https://www.sciencedirect.com/science/article/pii/S1877050924010858

[^3_30]: http://faculty.ksu.edu.sa/en/malyahya/publication/417896

[^3_31]: https://www.law-middleeast.com/saudi-arabias-new-data-driven-economy-opportunities-and-challenges/

[^3_32]: https://www.lw.com/admin/upload/SiteAttachments/Lexology-In-Depth-Artificial-Intelligence-Law-Saudi-Arabia.pdf

[^3_33]: https://doaj.org/article/b3055683e49548429f2395eaa1daea1c

[^3_34]: https://sdaia.gov.sa/en/Research/Documents/PSFDataAndAIBook.pdf

[^3_35]: https://huggingface.co/collections/Omartificial-Intelligence-Space/arabic-matryoshka-and-gate-embedding-models-666f764d3b570f44d7f77d4e

[^3_36]: https://www.linkedin.com/posts/tomaarsen_theres-a-new-1-arabic-embedding-model-for-activity-7214573103555715072-fF8P

[^3_37]: https://arxiv.org/html/2407.21139v2

[^3_38]: https://github.com/m-elbeltagi/Comparing_Arabic_Sentence_Transformers

[^3_39]: https://zilliz.com/ai-faq/what-is-the-significance-of-multilingual-models-like-labse-or-multilingualminilm-in-the-context-of-sentence-transformers

[^3_40]: https://huggingface.co/Xenova/multilingual-e5-large

[^3_41]: https://arxiv.org/abs/2407.21139

[^3_42]: https://huggingface.co/medmediani/Arabic-KW-Mdel

[^3_43]: https://www.sbert.net/docs/sentence_transformer/pretrained_models.html

[^3_44]: https://huggingface.co/embaas/sentence-transformers-multilingual-e5-large

[^3_45]: https://primer.ai/developer/language-agnostic-multilingual-sentence-embedding-models-for-semantic-search/

[^3_46]: https://huggingface.co/aiacademyvn/multilingual-e5-large-instruct

[^3_47]: https://community.pinecone.io/t/what-is-the-best-arabic-embedding-and-tokenization-models/5427

[^3_48]: https://huggingface.co/Enno-Ai/multilingual-e5-large

[^3_49]: https://huggingface.co/hatemestinbejaia/mmarco-Arabic-mMiniLML-bi-encoder-KD-v1

[^3_50]: https://aclanthology.org/2024.arabicnlp-1.82.pdf

[^3_51]: https://milvus.io/ai-quick-reference/how-do-you-use-sentence-transformers-in-a-multilingual-setting-for-example-loading-a-multilingual-model-to-encode-sentences-in-different-languages

[^3_52]: https://sbert.net/examples/cross_encoder/applications/README.html

[^3_53]: https://www.aimodels.fyi/models/huggingFace/paraphrase-multilingual-mpnet-base-v2-sentence-transformers

[^3_54]: https://python.langchain.com/docs/integrations/document_transformers/cross_encoder_reranker/

[^3_55]: https://github.com/UKPLab/sentence-transformers/issues/739

[^3_56]: https://arxiv.org/html/2403.10407v1

[^3_57]: https://huggingface.co/cross-encoder

[^3_58]: https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2

[^3_59]: https://www.elastic.co/search-labs/blog/elasticsearch-cross-encoder-reranker-huggingface

[^3_60]: https://journals.sagepub.com/doi/abs/10.1177/30504554241297614

[^3_61]: https://ollama.com/library/paraphrase-multilingual:278m-mpnet-base-v2-fp16

[^3_62]: https://www.elastic.co/search-labs/blog/elastic-semantic-reranker-part-1


---

# so give me more details about the backend and the architecture

A robust backend for this system uses a modular NestJS API with REST and WebSockets, a FastAPI microservice for embeddings, PostgreSQL with full‑text and pgvector search, Redis‑backed queues for monitoring jobs, and optional MinIO and Qdrant for artifacts and high‑throughput vector search, respectively. The design emphasizes separation of concerns: NestJS handles auth/CRUD/real‑time notifications, FastAPI performs semantic similarity, Postgres stores structured data and vectors, and background workers schedule scraping and re‑indexing safely at scale.[^4_1][^4_2][^4_3][^4_4][^4_5][^4_6][^4_7][^4_8][^4_9]

## Core services

- API service: NestJS (TypeScript) exposes REST endpoints, guards, and Swagger/OpenAPI docs, and hosts a Socket.IO gateway for live alerts and dashboard updates.[^4_10][^4_3][^4_4]
- AI service: FastAPI provides /embed and /find_related endpoints using sentence‑transformers/BGE‑M3‑style embeddings for retrieval and re‑ranking workflows.[^4_5][^4_11][^4_12]
- Data layer: PostgreSQL handles normalized data, GIN‑indexed tsvector columns for keyword search, and pgvector for ANN similarity over case/regulation embeddings.[^4_6][^4_7]


## Real‑time and async

- WebSockets: Socket.IO channels broadcast “regulation_updates” and “link_refresh” events to authenticated clients for instant UI feedback.[^4_4]
- Queues: Use NestJS queue integration with BullMQ/Bull on Redis for scraping, diffing, embedding updates, and notifications to ensure reliability and retry semantics.[^4_1]
- Scheduling: Use @nestjs/schedule for cron‑like periodic jobs to crawl sources and refresh indexes without blocking request threads.[^4_2]


## Regulation monitor pipeline

- Fetching: Use Puppeteer for robust headless browsing and screenshot/PDF generation when needed, falling back to Cheerio for fast static HTML parsing.[^4_13][^4_14]
- Scheduling: Run crawlers on cron intervals with NestJS scheduling, or node‑cron in worker context if decoupled, to poll official sources at controlled rates.[^4_15][^4_2]
- Change detection: After extraction, compute a checksum and create a regulation_versions row on change, then enqueue embedding and full‑text reindex jobs and emit a WebSocket alert.[^4_2][^4_4]


## Search layer

- Full‑text: Store normalized regulation/case text and maintain tsvector columns with GIN indexes to serve keyword search and ranking with tsquery.[^4_6]
- Semantic: Add a pgvector column (e.g., vector(384/768)) for embeddings and create HNSW/IVF indexes to enable fast ANN similarity in Postgres.[^4_7]
- Optional vector DB: Introduce Qdrant if corpus or QPS grows, enabling payload filters, hybrid retrieval, and high‑throughput vector search via REST/SDKs.[^4_9]


## Security and auth

- API authentication: Use NestJS Passport with JWT strategy and guards for route protection and role‑based access control in controllers.[^4_16][^4_17]
- Database isolation: Apply PostgreSQL Row‑Level Security for tenant/org scoping so each organization only sees its rows, providing defense‑in‑depth beyond application checks.[^4_18][^4_19]
- Storage security: For object storage, MinIO can integrate with a Key Encryption Service (KES) for server‑side encryption and policy‑based access control.[^4_20]


## Data model and indices

- Regulations: id, title, source_url, current_version_id, full_text tsvector, embedding vector, metadata; GIN on tsvector and ANN index on embedding.[^4_7][^4_6]
- Regulation versions: id, regulation_id, fetched_at, checksum, text_snapshot, artifact_uri (MinIO) to keep immutable snapshots for auditability and rollback.[^4_8]
- Cases: id, title, body, full_text tsvector, embedding vector, metadata for similarity and full‑text queries.[^4_6][^4_7]
- Links: case_regulation_links with score and method (ai/manual) to persist AI recommendations and human overrides for traceability.[^4_7]


## API and contracts

- REST: CRUD endpoints for /cases, /regulations, /regulations/{id}/versions, and /links with OpenAPI docs generated by @nestjs/swagger for client integration and testing.[^4_10]
- AI endpoints: FastAPI /embed and /find_related accept Arabic case/regulation text and return top‑K regulation IDs with scores, documented automatically via OpenAPI at startup.[^4_5]
- WebSockets: Namespaced Socket.IO gateway for “regulation_updates” and “link_refresh” events, with token‑based authentication during handshake.[^4_4]


## Background workers

- Job orchestration: Use NestJS queues to run crawlers, extract/clean text, update tsvector, recompute embeddings, and backfill links, with retries and backoff.[^4_1]
- Cron jobs: Define cron expressions with @nestjs/schedule to trigger collections and batch re‑indexes, coordinating multiple instances via queue locks if horizontally scaled.[^4_21][^4_2]
- Optional DB events: Use PostgreSQL LISTEN/NOTIFY to propagate database change events to workers or API instances without polling when suited to the workflow.[^4_22][^4_23]


## Model serving

- Embeddings: Load a sentence‑transformers encoder (e.g., all‑MiniLM‑L6‑v2 or multilingual options/BGE‑M3 for Arabic/English) behind FastAPI for reproducible, stateless inference.[^4_11][^4_12][^4_5]
- Re‑ranking: Optionally expose a re‑rank endpoint that uses a cross‑encoder to re‑score top‑K candidates for higher precision in legal linking.[^4_24]
- Index updates: After regulation changes, enqueue embed jobs to refresh vectors so semantic search stays aligned with the latest text.[^4_1]


## Observability and docs

- API documentation: Publish OpenAPI/Swagger for the NestJS API to ease Flutter integration and automated SDK generation if desired.[^4_10]
- Health and readiness: Provide health endpoints per service and basic metrics; Socket.IO server exposes basic connection status, and FastAPI auto‑docs give quick operational verification.[^4_4][^4_5]


## Storage and artifacts

- Object storage: Store PDF/HTML snapshots and attachments in MinIO to offload large artifacts from Postgres and support versioned access patterns.[^4_8]
- Access patterns: Keep only normalized and tokenized text in Postgres for search and semantics, with artifact_uri linking back to MinIO objects when raw material is required.[^4_8]


## Deployment shape

- Containers: Package each service in containers and wire them with environment variables for Postgres, Redis, MinIO, and optional Qdrant, keeping a small, independent FastAPI microservice for ML.[^4_9][^4_5][^4_8]
- Scale‑out: Horizontally scale the NestJS API and the worker pool separately, with Redis‑based queues ensuring one‑time job execution and natural backpressure.[^4_1]


## Why this fits KSA legal use

- Arabic‑first: The pipeline supports Arabic text extraction and embeddings, and can be paired with multilingual encoders when English sources appear in bilingual materials.[^4_12][^4_11]
- Auditability: Regulation versions, immutable snapshots, and event trails via versions and queues provide provenance for legal changes over time.[^4_8][^4_1]

If helpful, the next step can outline concrete module scaffolds (NestJS modules, FastAPI routers), queue names, and an initial set of SQL indexes for tsvector and pgvector to start coding immediately.[^4_3][^4_6][^4_7]
<span style="display:none">[^4_25][^4_26][^4_27][^4_28][^4_29][^4_30][^4_31][^4_32][^4_33][^4_34][^4_35][^4_36][^4_37][^4_38][^4_39][^4_40][^4_41][^4_42][^4_43][^4_44][^4_45][^4_46][^4_47][^4_48][^4_49][^4_50][^4_51][^4_52][^4_53][^4_54][^4_55][^4_56][^4_57][^4_58][^4_59][^4_60][^4_61][^4_62][^4_63][^4_64][^4_65][^4_66][^4_67][^4_68][^4_69][^4_70][^4_71]</span>

<div align="center">⁂</div>

[^4_1]: https://docs.nestjs.com/techniques/queues

[^4_2]: https://docs.nestjs.com/techniques/task-scheduling

[^4_3]: https://docs.nestjs.com

[^4_4]: https://socket.io/docs/v4/

[^4_5]: https://fastapi.tiangolo.com

[^4_6]: https://www.postgresql.org/docs/current/datatype-textsearch.html

[^4_7]: https://github.com/pgvector/pgvector

[^4_8]: https://charts.min.io

[^4_9]: https://qdrant.tech/documentation/

[^4_10]: https://docs.nestjs.com/recipes/swagger

[^4_11]: https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2

[^4_12]: https://huggingface.co/BAAI/bge-m3

[^4_13]: https://pptr.dev

[^4_14]: https://cheerio.js.org

[^4_15]: https://github.com/kelektiv/node-cron

[^4_16]: https://docs.nestjs.com/recipes/passport

[^4_17]: https://docs.nestjs.com/security/authentication

[^4_18]: https://www.postgresql.org/docs/current/ddl-rowsecurity.html

[^4_19]: https://www.postgresql.org/docs/current/sql-createpolicy.html

[^4_20]: https://docs.min.io/community/minio-kes/

[^4_21]: https://dev.to/juan_castillo/handling-cron-jobs-in-nestjs-with-multiple-instances-using-bull-3pj2

[^4_22]: https://www.postgresql.org/docs/current/sql-listen.html

[^4_23]: https://www.postgresql.org/docs/current/sql-notify.html

[^4_24]: https://www.sbert.net/docs/pretrained-models/ce-msmarco.html

[^4_25]: https://dev.to/railsstudent/queuing-jobs-in-nestjs-using-nestjsbullmq-package-55c1

[^4_26]: https://stackoverflow.com/questions/75423621/nestjs-bull-queue-and-redis-in-production

[^4_27]: https://rollingglory.com/blog/back-end/queues-using-bull-in-nestjs

[^4_28]: https://www.slaknoah.com/blog/step-by-step-guide-to-queue-processing-in-a-nest-js-application

[^4_29]: https://www.devcentrehouse.eu/blogs/scheduling-tasks-in-nestjs-using-cron-jobs/

[^4_30]: https://stackoverflow.com/questions/60099285/how-to-update-nestjs-swagger-module-but-use-openapi-2-0swagger

[^4_31]: https://www.youtube.com/watch?v=vFI_Nf2PWFQ

[^4_32]: https://dev.to/jay818/cron-jobs-in-nest-js-1g43

[^4_33]: https://www.speakeasy.com/openapi/frameworks/nestjs

[^4_34]: https://github.com/mister-coding/nestjs-queue-bull-redis

[^4_35]: https://dev.to/a_j_5235bc89cd4e28f40b973/cron-jobs-in-nestjs-using-nestjsschedule-4ncb

[^4_36]: https://github.com/nestjs/swagger

[^4_37]: https://www.mindbowser.com/nestjs-redis-task-processing/

[^4_38]: https://www.npmjs.com/package/@nestjs/schedule

[^4_39]: https://docs.nestjs.com/openapi/operations

[^4_40]: https://www.youtube.com/watch?v=8g6e1frHfAs

[^4_41]: https://pptr.dev/guides/what-is-puppeteer

[^4_42]: https://pptr.dev/api

[^4_43]: https://pptr.dev/category/guides

[^4_44]: https://pptr.dev/guides/getting-started

[^4_45]: https://www.jsdocs.io/package/cheerio

[^4_46]: https://pptr.dev/guides/configuration

[^4_47]: https://docs.flowiseai.com/integrations/langchain/document-loaders/cheerio-web-scraper

[^4_48]: https://github.com/harrisiirak/cron-parser

[^4_49]: https://github.com/puppeteer/pptr.dev

[^4_50]: https://github.com/cheeriojs/cheerio

[^4_51]: https://github.com/node-cron/node-cron

[^4_52]: https://pptr.dev/api/puppeteer.page

[^4_53]: https://github.com/topics/node-cron?o=desc\&s=updated

[^4_54]: https://pptr.dev/next/browsers-api

[^4_55]: https://crawlee.dev/js/docs/guides/cheerio-crawler-guide

[^4_56]: https://github.com/node-cron

[^4_57]: https://pptr.dev/guides/page-interactions

[^4_58]: https://supabase.com/docs/guides/database/postgres/row-level-security

[^4_59]: https://satoricyber.com/postgres-security/postgres-row-level-security/

[^4_60]: https://neon.com/postgresql/postgresql-administration/postgresql-row-level-security

[^4_61]: https://www.cybertec-postgresql.com/en/listen-notify-automatic-client-notification-in-postgresql/

[^4_62]: https://blog.stackademic.com/passport-jwt-authentication-in-nestjs-e3313d04de49

[^4_63]: https://www.bytebase.com/reference/postgres/how-to/postgres-row-level-security/

[^4_64]: https://www.youtube.com/watch?v=S8Cjx5ua2JU

[^4_65]: https://www.postgresql.org/docs/current/logical-replication-security.html

[^4_66]: https://dev.to/andisiambuku/user-authentication-with-passport-js-and-jwt-in-nest-js-1ag3

[^4_67]: https://www.permit.io/blog/postgres-rls-implementation-guide

[^4_68]: https://www.reddit.com/r/ExperiencedDevs/comments/1co3w3h/what_are_some_reasons_not_to_use_listennotify_in/

[^4_69]: https://www.scaleway.com/en/docs/serverless-sql-databases/api-cli/postgrest-row-level-security/

[^4_70]: https://neon.com/guides/pub-sub-listen-notify

[^4_71]: https://camelai.com/docs/dev_api/row-level-security/postgresql


---

# Complete Guide: Saudi Arabia Legal Case Management System

Building a comprehensive legal case management system for Saudi courts requires a **multi‑layered architecture** with Arabic‑specific AI models, robust background monitoring, and real‑time collaboration features. The system combines **NestJS for structured backend APIs**, **FastAPI for Arabic legal AI**, **PostgreSQL with vector search** for semantic similarity, and **Flutter with BLoC** for responsive mobile interfaces, all orchestrated through **Redis‑backed queues** and **WebSocket notifications** for live updates.[^5_1][^5_2][^5_3][^5_4][^5_5][^5_6]

![Saudi Arabia Case Management System Architecture](https://ppl-ai-code-interpreter-files.s3.amazonaws.com/web/direct-files/c19d3e2b595a170bfbfc634ff61a2591/bee27698-d5a5-4955-836c-8f8fbdbbbbfc/40148bbb.png)

Saudi Arabia Case Management System Architecture

## Project Overview and Requirements

### Core Features

- **Case Management**: Full CRUD operations for legal cases with Arabic text support, document attachments, and case timeline tracking.[^5_7]
- **Regulation Change Monitor**: Automated scraping of Saudi court websites and legal databases with change detection and real‑time alerts.[^5_8][^5_9][^5_10]
- **AI‑Powered Legal Linking**: Semantic similarity between cases and regulations using Arabic‑trained models like AraLegal‑BERT or multilingual BGE‑M3.[^5_11][^5_12]
- **Real‑time Collaboration**: WebSocket‑based notifications for regulation updates, case changes, and AI link discoveries.[^5_6]
- **Multi‑tenant Security**: Role‑based access control with PostgreSQL Row‑Level Security for law firm isolation.[^5_13][^5_14]


### Technology Stack

- **Backend**: NestJS with TypeScript, modular architecture, and OpenAPI documentation.[^5_1][^5_15]
- **AI Service**: FastAPI with sentence‑transformers, Arabic embeddings, and similarity ranking.[^5_2][^5_11]
- **Database**: PostgreSQL with full‑text search (tsvector), pgvector for embeddings, and structured legal entities.[^5_16][^5_17]
- **Frontend**: Flutter with BLoC state management, WebSocket client, and secure JWT storage.[^5_4][^5_18][^5_19]
- **Infrastructure**: Redis queues, MinIO object storage, Docker containers, and optional Qdrant vector DB.[^5_5][^5_20][^5_21]


## Detailed Database Design and Data Model

### Core Entities Schema

```sql
-- Organizations (Law Firms)
CREATE TABLE organizations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    license_number VARCHAR(100) UNIQUE,
    contact_info JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Users with Role-Based Access
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER REFERENCES organizations(id),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL DEFAULT 'lawyer',
    full_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    last_login TIMESTAMP
);

-- Legal Cases
CREATE TABLE cases (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER REFERENCES organizations(id),
    case_number VARCHAR(100) NOT NULL,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    case_type case_type_enum NOT NULL,
    status case_status_enum DEFAULT 'open',
    client_info JSONB,
    assigned_lawyer_id INTEGER REFERENCES users(id),
    
    -- Full-text and semantic search
    search_vector tsvector,
    embedding vector(384), -- or 768 for larger models
    
    -- Metadata
    court_jurisdiction VARCHAR(255),
    filing_date DATE,
    next_hearing TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Legal Regulations
CREATE TABLE regulations (
    id SERIAL PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    regulation_number VARCHAR(100),
    source_url TEXT,
    current_version_id INTEGER,
    category regulation_category,
    jurisdiction VARCHAR(255),
    
    -- Search capabilities
    search_vector tsvector,
    embedding vector(384),
    
    -- Metadata
    effective_date DATE,
    status regulation_status DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Regulation Version History
CREATE TABLE regulation_versions (
    id SERIAL PRIMARY KEY,
    regulation_id INTEGER REFERENCES regulations(id),
    version_number INTEGER NOT NULL,
    content TEXT NOT NULL,
    content_hash VARCHAR(64) NOT NULL, -- SHA-256 for change detection
    
    -- Document artifacts
    raw_html TEXT,
    artifact_uri VARCHAR(500), -- MinIO object path
    
    -- Change tracking
    changes_summary TEXT,
    fetched_at TIMESTAMP DEFAULT NOW(),
    created_by VARCHAR(50) DEFAULT 'system'
);

-- AI-Generated Case-Regulation Links
CREATE TABLE case_regulation_links (
    id SERIAL PRIMARY KEY,
    case_id INTEGER REFERENCES cases(id),
    regulation_id INTEGER REFERENCES regulations(id),
    similarity_score DECIMAL(5,4) NOT NULL,
    link_method link_method_enum DEFAULT 'ai',
    
    -- Human oversight
    verified BOOLEAN DEFAULT FALSE,
    verified_by INTEGER REFERENCES users(id),
    verified_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(case_id, regulation_id)
);

-- Case Documents and Attachments
CREATE TABLE case_documents (
    id SERIAL PRIMARY KEY,
    case_id INTEGER REFERENCES cases(id),
    document_type document_type_enum,
    title VARCHAR(255) NOT NULL,
    file_path VARCHAR(500), -- MinIO object path
    file_size BIGINT,
    mime_type VARCHAR(100),
    
    -- OCR and search
    extracted_text TEXT,
    search_vector tsvector,
    
    uploaded_by INTEGER REFERENCES users(id),
    uploaded_at TIMESTAMP DEFAULT NOW()
);
```


### Indexes for Performance

```sql
-- Full-text search indexes
CREATE INDEX idx_cases_search ON cases USING GIN(search_vector);
CREATE INDEX idx_regulations_search ON regulations USING GIN(search_vector);
CREATE INDEX idx_documents_search ON case_documents USING GIN(search_vector);

-- Vector similarity indexes (HNSW for approximate nearest neighbor)
CREATE INDEX idx_cases_embedding ON cases USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_regulations_embedding ON regulations USING hnsw (embedding vector_cosine_ops);

-- Query optimization indexes
CREATE INDEX idx_cases_org_status ON cases(organization_id, status);
CREATE INDEX idx_cases_lawyer ON cases(assigned_lawyer_id);
CREATE INDEX idx_regulations_category ON regulations(category, status);
CREATE INDEX idx_links_score ON case_regulation_links(case_id, similarity_score DESC);
```


### Enums and Types

```sql
CREATE TYPE user_role AS ENUM ('admin', 'senior_lawyer', 'lawyer', 'paralegal', 'clerk');
CREATE TYPE case_type_enum AS ENUM ('criminal', 'civil', 'commercial', 'labor', 'family', 'administrative');
CREATE TYPE case_status_enum AS ENUM ('open', 'in_progress', 'pending_hearing', 'closed', 'archived');
CREATE TYPE regulation_category AS ENUM ('criminal_law', 'civil_law', 'commercial_law', 'labor_law', 'procedural_law');
CREATE TYPE regulation_status AS ENUM ('active', 'amended', 'repealed', 'draft');
CREATE TYPE link_method_enum AS ENUM ('ai', 'manual', 'hybrid');
CREATE TYPE document_type_enum AS ENUM ('contract', 'evidence', 'pleading', 'correspondence', 'court_order');
```


### Row-Level Security for Multi-tenancy

```sql
-- Enable RLS on sensitive tables
ALTER TABLE cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_regulation_links ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access cases from their organization
CREATE POLICY cases_organization_policy ON cases
    FOR ALL TO authenticated_users
    USING (organization_id = current_setting('app.current_org_id')::INTEGER);

-- Policy: Lawyers can only see cases assigned to them or in their org
CREATE POLICY cases_lawyer_policy ON cases
    FOR SELECT TO lawyer_role
    USING (organization_id = current_setting('app.current_org_id')::INTEGER 
           AND (assigned_lawyer_id = current_setting('app.current_user_id')::INTEGER 
                OR current_setting('app.current_role') IN ('admin', 'senior_lawyer')));
```


## Backend Architecture with NestJS

### Project Structure

```
src/
├── app.module.ts                 # Root module
├── main.ts                       # Application bootstrap
├── common/                       # Shared utilities
│   ├── guards/
│   │   ├── jwt-auth.guard.ts
│   │   └── roles.guard.ts
│   ├── decorators/
│   │   ├── roles.decorator.ts
│   │   └── current-user.decorator.ts
│   ├── interceptors/
│   │   ├── logging.interceptor.ts
│   │   └── transform.interceptor.ts
│   └── pipes/
│       └── validation.pipe.ts
├── config/                       # Configuration management
│   ├── database.config.ts
│   ├── redis.config.ts
│   └── app.config.ts
├── modules/                      # Feature modules
│   ├── auth/
│   │   ├── auth.module.ts
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── jwt.strategy.ts
│   │   └── dto/
│   ├── cases/
│   │   ├── cases.module.ts
│   │   ├── cases.controller.ts
│   │   ├── cases.service.ts
│   │   ├── entities/case.entity.ts
│   │   └── dto/
│   ├── regulations/
│   │   ├── regulations.module.ts
│   │   ├── regulations.controller.ts
│   │   ├── regulations.service.ts
│   │   └── monitoring/
│   │       ├── regulation-monitor.service.ts
│   │       └── scrapers/
│   ├── ai-linking/
│   │   ├── ai-linking.module.ts
│   │   ├── ai-linking.service.ts
│   │   └── ai-client.service.ts
│   ├── notifications/
│   │   ├── notifications.module.ts
│   │   ├── notifications.gateway.ts  # WebSocket
│   │   └── notifications.service.ts
│   └── search/
│       ├── search.module.ts
│       ├── search.controller.ts
│       └── search.service.ts
└── database/
    ├── database.module.ts
    ├── migrations/
    └── seeds/
```


### Key NestJS Modules

**Authentication Module** :[^5_14][^5_22]

```typescript
@Injectable()
export class AuthService {
  async login(loginDto: LoginDto): Promise<{ access_token: string }> {
    const user = await this.validateUser(loginDto.email, loginDto.password);
    const payload = { 
      sub: user.id, 
      email: user.email, 
      role: user.role,
      orgId: user.organization_id 
    };
    return { access_token: this.jwtService.sign(payload) };
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('lawyer', 'senior_lawyer')
@Controller('cases')
export class CasesController {
  @Get()
  async findAll(@CurrentUser() user: User): Promise<Case[]> {
    return this.casesService.findByOrganization(user.organization_id);
  }
}
```

**Background Job Processing** :[^5_5][^5_10]

```typescript
@Processor('regulation-monitoring')
export class RegulationMonitorProcessor {
  @Process('check-updates')
  async handleRegulationCheck(job: Job<{ source_url: string }>) {
    const { source_url } = job.data;
    const newContent = await this.scraperService.fetchPage(source_url);
    const regulation = await this.regulationService.findByUrl(source_url);
    
    if (this.hasChanged(regulation.current_content_hash, newContent)) {
      await this.regulationService.createVersion(regulation.id, newContent);
      await this.notificationService.broadcastUpdate(regulation.id);
    }
  }
}

@Injectable()
export class RegulationMonitorService {
  @Cron('0 */6 * * *') // Every 6 hours
  async scheduleChecks() {
    const activeRegulations = await this.regulationService.findActive();
    for (const reg of activeRegulations) {
      await this.regulationQueue.add('check-updates', { source_url: reg.source_url });
    }
  }
}
```

**WebSocket Real-time Updates** :[^5_6]

```typescript
@WebSocketGateway({ namespace: 'legal-updates' })
export class NotificationsGateway implements OnGatewayConnection {
  @UseGuards(WsJwtGuard)
  async handleConnection(client: Socket) {
    const user = this.getUserFromToken(client.handshake.auth.token);
    client.join(`org:${user.organization_id}`);
  }

  @SubscribeMessage('join-case')
  async joinCaseRoom(client: Socket, caseId: number) {
    client.join(`case:${caseId}`);
  }

  async broadcastRegulationUpdate(regulationId: number, organizationId: number) {
    this.server.to(`org:${organizationId}`).emit('regulation-updated', {
      regulation_id: regulationId,
      timestamp: new Date(),
      type: 'content_change'
    });
  }
}
```


## AI Service with FastAPI

### Project Structure

```
ai_service/
├── app/
│   ├── main.py                   # FastAPI application
│   ├── config.py                 # Configuration
│   ├── models/                   # AI models management
│   │   ├── embeddings.py
│   │   ├── similarity.py
│   │   └── reranker.py
│   ├── routers/                  # API endpoints
│   │   ├── embedding.py
│   │   ├── similarity.py
│   │   └── health.py
│   ├── services/                 # Business logic
│   │   ├── model_service.py
│   │   └── vector_service.py
│   └── utils/
│       ├── text_preprocessing.py
│       └── arabic_utils.py
├── requirements.txt
├── Dockerfile
└── tests/
```


### FastAPI Implementation

**Main Application** :[^5_2]

```python
from fastapi import FastAPI, HTTPException
from sentence_transformers import SentenceTransformer
import numpy as np
from typing import List, Dict

app = FastAPI(
    title="Legal AI Service",
    description="Arabic legal text similarity and embedding service",
    version="1.0.0"
)

# Load Arabic legal model
model = SentenceTransformer('sentence-transformers/paraphrase-multilingual-mpnet-base-v2')
# Or for Saudi-specific: load AraLegal-BERT fine-tuned model

@app.post("/embed")
async def create_embeddings(texts: List[str]) -> Dict[str, List[List[float]]]:
    """Generate embeddings for Arabic legal texts."""
    try:
        embeddings = model.encode(texts)
        return {"embeddings": embeddings.tolist()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/find_related")
async def find_related_regulations(
    case_text: str, 
    regulation_embeddings: List[Dict[str, any]], 
    top_k: int = 10
) -> Dict[str, List[Dict]]:
    """Find most similar regulations to a case description."""
    case_embedding = model.encode([case_text])
    
    similarities = []
    for reg in regulation_embeddings:
        reg_embedding = np.array(reg['embedding'])
        similarity = np.dot(case_embedding, reg_embedding) / (
            np.linalg.norm(case_embedding) * np.linalg.norm(reg_embedding)
        )
        similarities.append({
            "regulation_id": reg['id'],
            "similarity_score": float(similarity),
            "title": reg['title']
        })
    
    # Sort and return top-k
    similarities.sort(key=lambda x: x['similarity_score'], reverse=True)
    return {"related_regulations": similarities[:top_k]}

@app.post("/rerank")
async def rerank_candidates(
    query: str,
    candidates: List[Dict[str, str]],
    top_k: int = 5
) -> Dict[str, List[Dict]]:
    """Re-rank top candidates using cross-encoder for higher precision."""
    # Implementation with cross-encoder model
    pass
```

**Arabic Text Processing** :[^5_11]

```python
import re
from typing import List

class ArabicTextProcessor:
    def __init__(self):
        # Arabic-specific preprocessing patterns
        self.diacritics_pattern = re.compile(r'[\u064B-\u0652\u0670\u0640]')
        self.punctuation_pattern = re.compile(r'[^\w\s\u0600-\u06FF]')
    
    def preprocess_legal_text(self, text: str) -> str:
        """Clean and normalize Arabic legal text."""
        # Remove diacritics for better matching
        text = self.diacritics_pattern.sub('', text)
        # Normalize Arabic letters
        text = text.replace('إ', 'ا').replace('أ', 'ا').replace('آ', 'ا')
        text = text.replace('ة', 'ه')  # Normalize taa marboota
        # Remove extra whitespace
        text = re.sub(r'\s+', ' ', text).strip()
        return text
    
    def extract_legal_entities(self, text: str) -> List[str]:
        """Extract legal entities like case numbers, law articles."""
        # Pattern for Saudi case numbers: e.g., "القضية رقم 12345/1445"
        case_pattern = r'القضية\s+رقم\s+(\d+/\d+)'
        # Pattern for law articles: e.g., "المادة 15 من نظام العمل"
        article_pattern = r'المادة\s+(\d+)\s+من\s+([^\n.]+)'
        
        entities = []
        entities.extend(re.findall(case_pattern, text))
        entities.extend(re.findall(article_pattern, text))
        return entities
```


## Frontend Architecture with Flutter

### Project Structure :[^5_23]

```
lib/
├── main.dart
├── app/                          # App-level configuration
│   ├── app.dart                  # Main app widget
│   ├── routes.dart               # Route definitions
│   └── themes.dart               # App themes
├── core/                         # Core utilities
│   ├── constants/
│   ├── errors/
│   ├── network/
│   │   ├── api_client.dart
│   │   └── websocket_client.dart
│   └── storage/
│       └── secure_storage.dart
├── features/                     # Feature modules
│   ├── auth/
│   │   ├── data/
│   │   │   ├── models/
│   │   │   ├── repositories/
│   │   │   └── datasources/
│   │   ├── domain/
│   │   │   ├── entities/
│   │   │   ├── repositories/
│   │   │   └── usecases/
│   │   └── presentation/
│   │       ├── bloc/
│   │       ├── pages/
│   │       └── widgets/
│   ├── cases/
│   │   └── [similar structure]
│   ├── regulations/
│   │   └── [similar structure]
│   └── dashboard/
│       └── [similar structure]
└── shared/                       # Shared components
    ├── widgets/
    ├── utils/
    └── extensions/
```


### BLoC State Management :[^5_4][^5_19]

**Case Management BLoC**:

```dart
// Events
abstract class CaseEvent extends Equatable {}

class LoadCases extends CaseEvent {
  @override
  List<Object> get props => [];
}

class CreateCase extends CaseEvent {
  final CaseModel case;
  CreateCase(this.case);
  @override
  List<Object> get props => [case];
}

class UpdateCaseLinks extends CaseEvent {
  final int caseId;
  final List<RegulationLink> aiLinks;
  UpdateCaseLinks(this.caseId, this.aiLinks);
  @override
  List<Object> get props => [caseId, aiLinks];
}

// States
abstract class CaseState extends Equatable {}

class CaseInitial extends CaseState {
  @override
  List<Object> get props => [];
}

class CaseLoading extends CaseState {
  @override
  List<Object> get props => [];
}

class CasesLoaded extends CaseState {
  final List<CaseModel> cases;
  CasesLoaded(this.cases);
  @override
  List<Object> get props => [cases];
}

class CaseLinksUpdated extends CaseState {
  final int caseId;
  final List<RegulationLink> links;
  CaseLinksUpdated(this.caseId, this.links);
  @override
  List<Object> get props => [caseId, links];
}

// BLoC
class CaseBloc extends Bloc<CaseEvent, CaseState> {
  final CaseRepository repository;
  final WebSocketService webSocketService;
  
  CaseBloc(this.repository, this.webSocketService) : super(CaseInitial()) {
    on<LoadCases>(_onLoadCases);
    on<CreateCase>(_onCreateCase);
    on<UpdateCaseLinks>(_onUpdateCaseLinks);
    
    // Listen to WebSocket updates
    webSocketService.onRegulationUpdate().listen((update) {
      add(RefreshAILinks(update.affectedCases));
    });
  }
  
  Future<void> _onLoadCases(LoadCases event, Emitter<CaseState> emit) async {
    emit(CaseLoading());
    try {
      final cases = await repository.getAllCases();
      emit(CasesLoaded(cases));
    } catch (e) {
      emit(CaseError(e.toString()));
    }
  }
}
```


### Secure Storage and API Client :[^5_18]

```dart
class SecureStorageService {
  static const FlutterSecureStorage _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(
      encryptedSharedPreferences: true,
    ),
    iOptions: IOSOptions(
      accessibility: IOSAccessibility.first_unlock_this_device,
    ),
  );

  static Future<void> storeToken(String token) async {
    await _storage.write(key: 'jwt_token', value: token);
  }

  static Future<String?> getToken() async {
    return await _storage.read(key: 'jwt_token');
  }

  static Future<void> clearAll() async {
    await _storage.deleteAll();
  }
}

class ApiClient {
  late final Dio _dio;
  final WebSocketService _wsService;

  ApiClient(this._wsService) {
    _dio = Dio(BaseOptions(
      baseUrl: 'https://api.legal-system.sa',
      connectTimeout: Duration(seconds: 30),
      receiveTimeout: Duration(seconds: 30),
    ));
    
    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final token = await SecureStorageService.getToken();
        if (token != null) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        handler.next(options);
      },
      onError: (error, handler) {
        if (error.response?.statusCode == 401) {
          // Token expired, redirect to login
          _wsService.disconnect();
          // Navigate to login screen
        }
        handler.next(error);
      },
    ));
  }

  Future<List<CaseModel>> getCases() async {
    final response = await _dio.get('/cases');
    return (response.data as List)
        .map((json) => CaseModel.fromJson(json))
        .toList();
  }

  Future<List<RegulationLink>> getAILinks(int caseId) async {
    final response = await _dio.post('/ai-linking/find-related', data: {
      'case_id': caseId,
    });
    return (response.data['links'] as List)
        .map((json) => RegulationLink.fromJson(json))
        .toList();
  }
}
```


### WebSocket Integration :[^5_6]

```dart
class WebSocketService {
  IOWebSocketChannel? _channel;
  final StreamController<RegulationUpdate> _regulationUpdates = StreamController.broadcast();
  final StreamController<CaseLinkUpdate> _linkUpdates = StreamController.broadcast();

  Future<void> connect(String token) async {
    try {
      _channel = IOWebSocketChannel.connect(
        'wss://api.legal-system.sa/socket.io/',
        headers: {'Authorization': 'Bearer $token'},
      );
      
      _channel!.stream.listen((message) {
        final data = jsonDecode(message);
        
        switch (data['event']) {
          case 'regulation-updated':
            _regulationUpdates.add(RegulationUpdate.fromJson(data));
            break;
          case 'case-links-refreshed':
            _linkUpdates.add(CaseLinkUpdate.fromJson(data));
            break;
        }
      });
      
      // Join organization room
      _channel!.sink.add(jsonEncode({
        'event': 'join-organization',
        'data': {'org_id': await _getOrgId()}
      }));
      
    } catch (e) {
      print('WebSocket connection failed: $e');
    }
  }

  Stream<RegulationUpdate> onRegulationUpdate() => _regulationUpdates.stream;
  Stream<CaseLinkUpdate> onLinkUpdate() => _linkUpdates.stream;

  void disconnect() {
    _channel?.sink.close();
    _channel = null;
  }
}
```


## Easy Development Roadmap

### Phase 1: Foundation (Weeks 1-2)[^5_1][^5_2]

1. **Setup Development Environment**:
    - Install Node.js, Python, PostgreSQL, Redis, Flutter SDK
    - Setup Docker containers for services
    - Configure development databases
2. **Backend Scaffolding**:

```bash
# NestJS Backend
npm i -g @nestjs/cli
nest new legal-backend
nest generate module auth
nest generate module cases
nest generate module regulations

# FastAPI AI Service  
mkdir ai-service && cd ai-service
python -m venv venv
pip install fastapi sentence-transformers uvicorn
```

3. **Database Schema**:
    - Create PostgreSQL database with extensions
    - Run migration scripts for core tables
    - Setup basic indexes and RLS policies

### Phase 2: Core Features (Weeks 3-4)[^5_7][^5_11]

1. **Authentication System**:
    - JWT-based auth with NestJS Passport[^5_14]
    - User registration and role management
    - Flutter login screens with secure storage[^5_18]
2. **Case Management CRUD**:
    - REST API endpoints in NestJS
    - Flutter UI with BLoC state management[^5_4]
    - File upload to MinIO integration[^5_20]
3. **Arabic AI Integration**:
    - Load multilingual sentence-transformers model[^5_24]
    - FastAPI embedding and similarity endpoints[^5_25]
    - Basic case-regulation linking workflow

### Phase 3: Advanced Features (Weeks 5-6)[^5_6][^5_10]

1. **Regulation Monitoring**:
    - Web scraping with Puppeteer[^5_8]
    - Background jobs with Bull queues[^5_5]
    - Change detection and versioning
2. **Real-time Updates**:
    - WebSocket gateway in NestJS[^5_6]
    - Flutter WebSocket client integration
    - Live notifications for regulation changes
3. **Search and Discovery**:
    - PostgreSQL full-text search with tsvector[^5_16]
    - Vector similarity with pgvector[^5_17]
    - Advanced filtering and faceted search

### Phase 4: Polish and Deploy (Week 7)[^5_20][^5_21]

1. **Performance Optimization**:
    - Database query optimization
    - Optional Qdrant integration for large datasets[^5_21]
    - Redis caching for frequent queries
2. **Testing and Documentation**:
    - Unit tests for critical business logic
    - API documentation with Swagger[^5_15]
    - Flutter integration tests
3. **Deployment**:
    - Docker containerization
    - Environment configuration
    - CI/CD pipeline setup

## Quick Start Commands

```bash
# Backend Setup
git clone <your-repo>
cd legal-backend
npm install
docker-compose up -d  # Start PostgreSQL, Redis, MinIO
npm run migration:run
npm run start:dev

# AI Service
cd ai-service
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001

# Flutter App
cd flutter-app
flutter pub get
flutter run
```

This architecture provides **scalability** through modular NestJS design, **Arabic language support** via specialized AI models, **real‑time collaboration** through WebSockets, and **security** via JWT authentication and PostgreSQL RLS, creating a production‑ready legal case management system specifically tailored for Saudi Arabia's judicial requirements.[^5_1][^5_6][^5_11][^5_13]
<span style="display:none">[^5_26][^5_27][^5_28][^5_29][^5_30][^5_31][^5_32][^5_33][^5_34][^5_35][^5_36][^5_37][^5_38][^5_39][^5_40][^5_41][^5_42][^5_43][^5_44][^5_45][^5_46][^5_47][^5_48][^5_49][^5_50][^5_51][^5_52][^5_53][^5_54][^5_55][^5_56][^5_57]</span>

<div align="center">⁂</div>

[^5_1]: https://www.geeksforgeeks.org/javascript/folder-structure-of-a-nestjs-project/

[^5_2]: https://dev.to/mohammad222pr/structuring-a-fastapi-project-best-practices-53l6

[^5_3]: https://github.com/zhanymkanov/fastapi-best-practices

[^5_4]: https://www.geeksforgeeks.org/flutter/how-to-manage-state-in-flutter-with-bloc-pattern/

[^5_5]: https://docs.nestjs.com/techniques/queues

[^5_6]: https://socket.io/docs/v4/

[^5_7]: https://csveda.com/case-management-software-for-lawyers-a-flask-postgresql-project/

[^5_8]: https://pptr.dev

[^5_9]: https://github.com/kelektiv/node-cron

[^5_10]: https://docs.nestjs.com/techniques/task-scheduling

[^5_11]: https://aclanthology.org/2022.nllp-1.31.pdf

[^5_12]: https://huggingface.co/BAAI/bge-m3

[^5_13]: https://www.postgresql.org/docs/current/ddl-rowsecurity.html

[^5_14]: https://docs.nestjs.com/recipes/passport

[^5_15]: https://docs.nestjs.com/recipes/swagger

[^5_16]: https://www.postgresql.org/docs/current/datatype-textsearch.html

[^5_17]: https://github.com/pgvector/pgvector

[^5_18]: https://stackoverflow.com/questions/55035587/whats-the-best-way-to-keep-jwt-tokens-safely-saved-locally-in-flutter-apps

[^5_19]: https://bloclibrary.dev

[^5_20]: https://charts.min.io

[^5_21]: https://qdrant.tech/documentation/

[^5_22]: https://docs.nestjs.com/security/authentication

[^5_23]: https://deep5.io/en/flutter-app-architecture-a-modular-approach/

[^5_24]: https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2

[^5_25]: https://fastapi.tiangolo.com

[^5_26]: https://www.freecodecamp.org/news/the-nestjs-handbook-learn-to-use-nest-with-code-examples/

[^5_27]: https://www.dbvis.com/thetable/schemas-in-postgresql/

[^5_28]: https://github.com/CatsMiaow/nestjs-project-structure

[^5_29]: https://aws.amazon.com/blogs/database/manage-case-insensitive-data-in-postgresql/

[^5_30]: https://www.linkedin.com/pulse/fastapi-best-practices-condensed-guide-examples-nuno-bispo-9pd2e

[^5_31]: https://docs.nestjs.com/modules

[^5_32]: https://www.postgresql.org/docs/current/ddl-schemas.html

[^5_33]: https://developer-service.blog/fastapi-best-practices-a-condensed-guide-with-examples/

[^5_34]: https://dev.to/ehsanahmadzadeh/nestjs-fundamentals-part-1-modularity-in-nestjs-5d7p

[^5_35]: https://neon.com/postgresql/postgresql-administration/postgresql-schema

[^5_36]: https://dev.to/timo_reusch/how-i-structure-big-fastapi-projects-260e

[^5_37]: https://dev.to/smolinari/nestjs-and-project-structure-what-to-do-1223

[^5_38]: https://www.tigerdata.com/learn/how-to-design-postgresql-database-two-schema-examples

[^5_39]: https://www.reddit.com/r/FastAPI/comments/1g5zl81/looking_for_projects_best_practices/

[^5_40]: https://www.reddit.com/r/nestjs/comments/1fwl96f/what_folder_structure_do_you_use/

[^5_41]: https://stackoverflow.com/questions/5678902/postgresql-schemas-usage-scenario-case

[^5_42]: https://pub.dev/packages/jwt_auth

[^5_43]: https://semaphore.io/blog/state-management-flutter-bloc-redux

[^5_44]: https://dev.to/yatendra2001/mastering-navigation-in-flutter-a-comprehensive-guide-1p1l

[^5_45]: https://www.youtube.com/watch?v=7DqH3SIP5MA

[^5_46]: https://core.digit.org/guides/developer-guide/flutter-mobile-app-ui-developer-guide/state-management-with-provider-and-bloc/bloc-state-management

[^5_47]: https://www.freecodecamp.org/news/routing-and-multi-screen-development-in-flutter-for-beginners/

[^5_48]: https://github.com/juliansteenbakker/flutter_secure_storage/issues/933

[^5_49]: https://dev.to/vishnucprasad/state-management-in-flutter-with-bloc-and-freezed-1k80

[^5_50]: https://docs.flutter.dev/ui/navigation

[^5_51]: https://www.geeksforgeeks.org/flutter/routes-and-navigator-in-flutter/

[^5_52]: https://dev.to/carminezacc/securely-storing-jwts-in-flutter-web-apps-2nal

[^5_53]: https://pub.dev/packages/flutter_bloc

[^5_54]: https://docs.flutter.dev/app-architecture/guide

[^5_55]: https://pub.dev/packages/flutter_session_jwt

[^5_56]: https://www.youtube.com/watch?v=rF6eq1oru-Y

[^5_57]: https://docs.flutter.dev/cookbook/navigation/navigation-basics


---

# ok i want the basic simple form of my database as a version of SQL code i can put it in eraser.io website

Here is a basic, clean SQL schema for a Saudi legal case management system that can be pasted into Eraser to generate an ERD directly from SQL code for quick diagramming of tables and relationships. It keeps only the essential entities and foreign keys so it’s easy to import and tweak visually inside Eraser’s ERD workflow.[^6_1][^6_2][^6_3][^6_4]

## What this includes

- A minimal relational model: organizations, users, cases, regulations, regulation_versions, case_regulation_links, and case_documents with primary and foreign keys designed for clear ERD parsing.[^6_3][^6_1]
- Advanced search fields like tsvector and vector embeddings are intentionally omitted here for simplicity and better ERD readability, and can be added later if desired (PostgreSQL supports tsvector for full‑text and pgvector for embeddings).[^6_5][^6_6]
- Standard SQL types and constraints are used to keep the script portable and easy for Eraser’s SQL‑to‑diagram import, which accepts SQL files or snippets to render the ER model automatically.[^6_2][^6_4]


## Basic SQL schema

```sql
-- Organizations (Law Firms)
CREATE TABLE organizations (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(255) NOT NULL,
  license_number VARCHAR(100),
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);

-- Users
CREATE TABLE users (
  id              SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email           VARCHAR(255) UNIQUE NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  full_name       VARCHAR(255),
  role            VARCHAR(50) DEFAULT 'lawyer',  -- simple text role for basic ERD
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

-- Legal Cases
CREATE TABLE cases (
  id                 SERIAL PRIMARY KEY,
  organization_id    INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  case_number        VARCHAR(100) NOT NULL,
  title              VARCHAR(500) NOT NULL,
  description        TEXT,
  case_type          VARCHAR(100),              -- e.g., commercial, labor, civil
  status             VARCHAR(50) DEFAULT 'open',
  filing_date        DATE,
  assigned_lawyer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  court_jurisdiction VARCHAR(255),
  created_at         TIMESTAMP DEFAULT NOW(),
  updated_at         TIMESTAMP DEFAULT NOW(),
  UNIQUE (organization_id, case_number)
);

-- Regulations (Current Head)
CREATE TABLE regulations (
  id                 SERIAL PRIMARY KEY,
  title              VARCHAR(500) NOT NULL,
  regulation_number  VARCHAR(100),
  source_url         TEXT,
  category           VARCHAR(100),            -- e.g., labor_law, commercial_law
  jurisdiction       VARCHAR(255),            -- e.g., KSA
  status             VARCHAR(50) DEFAULT 'active',
  effective_date     DATE,
  created_at         TIMESTAMP DEFAULT NOW(),
  updated_at         TIMESTAMP DEFAULT NOW()
);

-- Regulation Versions (History)
CREATE TABLE regulation_versions (
  id               SERIAL PRIMARY KEY,
  regulation_id    INTEGER NOT NULL REFERENCES regulations(id) ON DELETE CASCADE,
  version_number   INTEGER NOT NULL,
  content          TEXT NOT NULL,
  content_hash     VARCHAR(64) NOT NULL,      -- SHA-256 or similar
  fetched_at       TIMESTAMP DEFAULT NOW(),
  artifact_uri     VARCHAR(500),              -- path in object storage (e.g., MinIO)
  changes_summary  TEXT,
  created_at       TIMESTAMP DEFAULT NOW(),
  UNIQUE (regulation_id, version_number)
);

-- AI / Manual Links between Cases and Regulations
CREATE TABLE case_regulation_links (
  id               SERIAL PRIMARY KEY,
  case_id          INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  regulation_id    INTEGER NOT NULL REFERENCES regulations(id) ON DELETE CASCADE,
  similarity_score NUMERIC(5,4),              -- optional for reference
  method           VARCHAR(20) DEFAULT 'ai',  -- 'ai' | 'manual' | 'hybrid'
  verified         BOOLEAN DEFAULT FALSE,
  created_at       TIMESTAMP DEFAULT NOW(),
  UNIQUE (case_id, regulation_id)
);

-- Case Documents and Attachments
CREATE TABLE case_documents (
  id            SERIAL PRIMARY KEY,
  case_id       INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  title         VARCHAR(255) NOT NULL,
  document_type VARCHAR(100),                 -- e.g., contract, evidence, pleading
  file_path     VARCHAR(500),                 -- path in object storage (e.g., MinIO)
  file_size     BIGINT,
  mime_type     VARCHAR(100),
  uploaded_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  uploaded_at   TIMESTAMP DEFAULT NOW()
);
```


## How to use in Eraser

- Open Eraser and create or open a diagram canvas, then paste this SQL into the ERD AI/Import flow to auto‑generate entities and relationships from the DDL.[^6_2][^6_3]
- Eraser’s “AI ERD Generator” supports feeding SQL snippets or files and will produce a diagram that can be edited visually, adding notes or attributes as the model evolves.[^6_1][^6_2]


## Notes if you later expand

- When ready for search and AI, add tsvector columns for PostgreSQL full‑text search and create GIN indexes, and add a vector column via pgvector for semantic similarity linking, which are both standard Postgres patterns for production search pipelines.[^6_6][^6_5]
- Postgres schemas can be used to organize multi‑tenant or staging areas if desired, but the simple single‑schema approach above is often best for initial ERD design in Eraser.[^6_7][^6_8]
<span style="display:none">[^6_10][^6_11][^6_12][^6_13][^6_14][^6_15][^6_16][^6_17][^6_18][^6_19][^6_20][^6_21][^6_22][^6_9]</span>

<div align="center">⁂</div>

[^6_1]: https://www.eraser.io/use-case/data-model

[^6_2]: https://www.eraser.io/ai/erd-generator

[^6_3]: https://docs.eraser.io/docs/entity-relationship-diagrams

[^6_4]: https://www.eraser.io/guides/best-ai-diagram-tools-in-2025

[^6_5]: https://www.postgresql.org/docs/current/datatype-textsearch.html

[^6_6]: https://github.com/pgvector/pgvector

[^6_7]: https://www.postgresql.org/docs/current/ddl-schemas.html

[^6_8]: https://neon.com/postgresql/postgresql-administration/postgresql-schema

[^6_9]: https://stackoverflow.com/questions/67368681/how-to-export-schema-and-import-it-to-another-schema-in-pl-sql-developer

[^6_10]: https://learn.microsoft.com/en-us/sql/integration-services/import-export-data/start-the-sql-server-import-and-export-wizard?view=sql-server-ver17

[^6_11]: https://sparxsystems.com/enterprise_architect_user_guide/17.1/modeling_domains/importdatabaseschemafromod.html

[^6_12]: https://neon.com/docs/import/migrate-schema-only

[^6_13]: https://www.youtube.com/watch?v=FhlE608zZ2Y

[^6_14]: https://www.geeksforgeeks.org/postgresql/postgresql-schema/

[^6_15]: https://learn.microsoft.com/en-us/sql/relational-databases/security/authentication-access/create-a-database-schema?view=sql-server-ver17

[^6_16]: https://www.tigerdata.com/learn/how-to-design-postgresql-database-two-schema-examples

[^6_17]: https://drawsql.app/docs/export-to-sql-ddl

[^6_18]: https://www.youtube.com/shorts/WYue6pHVaqM

[^6_19]: https://www.telerik.com/products/aspnet-ajax/documentation/knowledge-base/common-import-and-export-sql-database-to-sql-script-via-sql-management-studio

[^6_20]: https://developers.cloudflare.com/d1/best-practices/import-export-data/

[^6_21]: https://www.eraser.io/ai/data-flow-diagram-generator

[^6_22]: https://estuary.dev/blog/postgres-schema/


---

# this is the project proposal we should use : (Please ignore the attached file don't consider it or read it)

this is the instruction to fill it and i want you to enhance to current proposal based on the results you gave me:

1. Problem Statement
(1-2 paragraphs, 5-10 lines)The problem statement should describe the problem to be addressed, state why it matters, and propose a solution.2. Project Aims and Objectives
(1-2 paragraphs, 5-10 lines)The aim:

- Describe what you intend to achieve by doing this piece of work.
- State the expected results or outcomes that the project will produce.
The objectives:
- Determine the tangible outcomes that you should complete to achieve your aim.
- Refer to what you want to know, prove, demonstrate, analyze, test, investigate, or examine.3. Methodology
(1-2 paragraphs, 5-10 lines)Methodology should include clear and direct linkage between each objective and its expected results. Normally, it could include the following:
- How do you anticipate achieving your aim?
- What do you need? (Specify any special equipment, software, or material.)
- Do you require particular resources?
- Can you access necessary data or expertise from open sources, or do you need to purchase them?
- Are there barriers or pitfalls?
- Can you provide some justification of your selected approach?4. Project Plan
(Gantt chart /Table for milestones including dates)
it's long for 16 week starting from 2026 jan (implementation phase *we can start before*)the planning and designing phase is starting from October 2025 until 2026 then we will reach the start date that i gave you, so that is the implementation date
you can start from October then put the plan for other phases after 2026 begins

Below is an enhanced, submission‑ready **proposal** with refined problem, aims, methodology, and a 16‑week implementation plan aligned to NestJS + FastAPI + PostgreSQL + Arabic NLP and real‑time monitoring requirements. It is tailored for Saudi legal practice, using Arabic legal models (AraLegal‑BERT/BGE‑M3), full‑text and vector search, Puppeteer scraping, and WebSocket alerts to deliver practical value quickly.[^7_1][^7_2][^7_3][^7_4][^7_5][^7_6][^7_7][^7_8][^7_9]

### Problem statement

Legal practitioners in Saudi Arabia face continuous regulatory updates and dispersed sources, making it difficult to detect changes promptly and link them to active cases without missing critical amendments or new precedents, especially across long Arabic legal documents with complex terminology and styles. Traditional keyword search struggles with semantic nuance in Arabic, so relevant regulations may not be retrieved when phrasing differs from case descriptions, causing time loss and potential risk to outcomes. This project proposes an intelligent case management system that automatically monitors official sources with a headless browser scraper, versions regulation texts, and issues real‑time alerts on detected changes to the mobile client for immediate action. The system augments retrieval with Arabic/multilingual sentence embeddings (e.g., AraLegal‑BERT or BGE‑M3) stored in PostgreSQL via pgvector to surface semantically related statutes for each case in a dashboard, complementing full‑text search (tsvector) for robust discovery and traceability. By combining a structured NestJS backend with a FastAPI AI microservice, the solution separates concerns for reliability and scale while providing typed, documented APIs that accelerate team delivery.[^7_2][^7_3][^7_4][^7_5][^7_6][^7_7][^7_8][^7_9][^7_1]

### Project aims and objectives

Aim: Build a functional mobile‑first case management system that manages cases, monitors and versions Saudi regulations, and presents an AI‑generated list of the most semantically relevant regulations for each case, using Arabic‑optimized embeddings, full‑text search, and real‑time notifications. Expected outcomes include a Flutter app with secure auth, a NestJS API with OpenAPI docs, a FastAPI AI service that computes embeddings and similarity, automated regulation change detection with version history, and a dashboard that explains and stores case–regulation links with scores.[^7_3][^7_4][^7_5][^7_6][^7_8][^7_1][^7_2]

Objectives:

- Investigate legal NLP for Arabic and evaluate AraLegal‑BERT vs BGE‑M3 for sentence embeddings and similarity on Saudi legal text samples.[^7_7][^7_9]
- Develop the backend with NestJS, including auth, case/regulation CRUD, OpenAPI docs, and WebSocket channels for live alerts and link refresh events.[^7_5][^7_10][^7_2]
- Implement a FastAPI microservice for embedding and top‑K similarity with clear contracts for /embed and /find_related endpoints.[^7_3]
- Configure PostgreSQL full‑text search (tsvector) and pgvector indexes for hybrid keyword+semantic retrieval across cases, regulations, and versions.[^7_4][^7_1]
- Build a Puppeteer‑based monitor to fetch sources, normalize content, compute checksums, persist versions, and trigger notifications and re‑indexing jobs.[^7_6]
- Integrate mobile app flows for secure JWT auth and real‑time updates, rendering AI‑linked regulations per case with scores and verification controls.[^7_5]


### Methodology

The system adopts a microservices‑style separation: a typed NestJS API for auth/CRUD/real‑time and a FastAPI AI service for embeddings and similarity, enabling parallel development, clear interfaces, and simpler testing under an Agile cadence of iterative delivery and integration. Core components include PostgreSQL with full‑text search for lexical recall, pgvector for dense similarity, Redis‑backed queues for scraping and index refresh jobs, Puppeteer for robust website automation, and Socket.IO for resilient client notifications with automatic reconnection. Resources required are open‑source frameworks and libraries (NestJS, FastAPI, sentence‑transformers, pgvector, Puppeteer), commodity cloud or on‑prem VMs/containers for services, and public legal websites as data sources; no paid datasets are required to start. Anticipated barriers include inconsistent site structures and anti‑bot measures for scraping, and model precision on long legal texts; these are mitigated via headless browser automation, content normalization pipelines, and Arabic‑domain models (AraLegal‑BERT) or multilingual BGE‑M3 with hybrid retrieval and optional re‑ranking. The approach is justified because full‑text search plus semantic embeddings improves recall and relevance over keywords alone for Arabic legal text, and the chosen frameworks offer strong documentation, typing, and performance for production‑ready APIs.[^7_9][^7_11][^7_1][^7_2][^7_4][^7_6][^7_7][^7_3][^7_5]

### Project plan

The plan spans design (Oct–Dec 2025) and a 16‑week implementation (Jan–Apr 2026), balancing backend, AI, mobile, and monitoring streams with integration checkpoints and testing gates. Dates approximate academic timelines and can be shifted to match exact semester calendars and demo deadlines while retaining dependency order across services and data.[^7_2][^7_3]


| Period | Dates | Phase | Key milestones |
| :-- | :-- | :-- | :-- |
| Oct 2025 | Oct 1–31, 2025 | Research \& scoping | Review Arabic legal NLP, pick candidate models (AraLegal‑BERT, BGE‑M3), list official sources to monitor, and draft initial data model [^7_7][^7_9]. |
| Nov 2025 | Nov 1–30, 2025 | Architecture \& schema | Finalize service boundaries (NestJS API, FastAPI AI), ERD for cases/regulations/versions/links, and API surface with OpenAPI [^7_2][^7_10]. |
| Dec 2025 | Dec 1–31, 2025 | Prototyping \& setup | Repos, Docker compose, Postgres with full‑text and pgvector enabled, skeleton modules, and CI for lint/test [^7_1][^7_4]. |
| Weeks 1–5 | Jan 5–Feb 6, 2026 | Core development | Auth + CRUD in NestJS, Flutter auth and case lists, FastAPI /embed and /find_related with a baseline embedding model [^7_2][^7_3]. |
| Weeks 6–10 | Feb 9–Mar 13, 2026 | Integration \& features | Wire API ↔ AI calls, implement tsvector + pgvector search, add Socket.IO notifications, and initial dashboard for AI links [^7_1][^7_4][^7_5]. |
| Weeks 11–16 | Mar 16–Apr 24, 2026 | Monitoring \& testing | Puppeteer monitor + versioning, job queues for re‑indexing, end‑to‑end tests, UX polish, and demo prep [^7_6][^7_11]. |

### What will be delivered

- NestJS backend with documented endpoints, auth guards, and WebSocket gateway for real‑time regulation updates and link refresh events.[^7_10][^7_2][^7_5]
- FastAPI AI service exposing embedding and similarity endpoints using an Arabic/multilingual sentence‑transformer suitable for Saudi legal texts.[^7_7][^7_9][^7_3]
- PostgreSQL schema for cases, regulations, versions, links, and documents, with full‑text and vector indexes for hybrid retrieval and fast AI‑assisted linking.[^7_1][^7_4]
- Flutter mobile app for case management, alerts, and AI‑recommended regulation lists with scores and verification toggles for human oversight.[^7_5]


### Tools and dependencies

- Backend: NestJS with TypeScript, OpenAPI via @nestjs/swagger, BullMQ queues on Redis for scraping and re‑index jobs, and Socket.IO for client updates.[^7_11][^7_10][^7_2][^7_5]
- AI: FastAPI with sentence‑transformers; Arabic legal baseline via AraLegal‑BERT; optional multilingual BGE‑M3 for cross‑lingual or long‑context scenarios.[^7_9][^7_3][^7_7]
- Data: PostgreSQL with tsvector full‑text search and pgvector for embeddings to support both lexical and semantic lookup efficiently in one store.[^7_4][^7_1]
- Monitoring: Puppeteer headless browser to retrieve content, capture changes, and persist version history for transparency and audit.[^7_6]

This enhanced plan anchors scope to high‑impact features and proven open‑source components, ensuring feasibility for a student team while delivering measurable value to legal practitioners in Saudi Arabia from day one.[^7_2][^7_3]
<span style="display:none">[^7_12][^7_13][^7_14][^7_15][^7_16][^7_17][^7_18][^7_19][^7_20][^7_21][^7_22][^7_23][^7_24][^7_25][^7_26][^7_27][^7_28][^7_29][^7_30][^7_31][^7_32][^7_33][^7_34][^7_35][^7_36][^7_37][^7_38][^7_39][^7_40][^7_41][^7_42][^7_43][^7_44][^7_45][^7_46][^7_47][^7_48][^7_49][^7_50][^7_51][^7_52][^7_53][^7_54][^7_55][^7_56][^7_57][^7_58][^7_59][^7_60][^7_61]</span>

<div align="center">⁂</div>

[^7_1]: https://www.postgresql.org/docs/current/datatype-textsearch.html

[^7_2]: https://docs.nestjs.com

[^7_3]: https://fastapi.tiangolo.com

[^7_4]: https://github.com/pgvector/pgvector

[^7_5]: https://socket.io/docs/v4/

[^7_6]: https://pptr.dev

[^7_7]: https://arxiv.org/abs/2210.08284

[^7_8]: https://aclanthology.org/2022.nllp-1.31.pdf

[^7_9]: https://huggingface.co/BAAI/bge-m3

[^7_10]: https://docs.nestjs.com/recipes/swagger

[^7_11]: https://docs.nestjs.com/techniques/queues

[^7_12]: https://nestjs.com

[^7_13]: https://github.com/nestjs/docs.nestjs.com

[^7_14]: https://docs.nestjs.cn

[^7_15]: https://www.npmjs.com/package/@nestjs/common

[^7_16]: https://www.scribd.com/document/883389557/Fastapi-Tiangolo-Com-Tutorial

[^7_17]: https://neon.com/docs/data-types/tsvector

[^7_18]: https://hub.continue.dev/konrad1221/nestjs-docs

[^7_19]: https://www.postgresql.org/docs/current/textsearch-controls.html

[^7_20]: https://x.com/nestframework/status/1822938111044698341?lang=ar-x-fm

[^7_21]: https://fastapi-tutorial.readthedocs.io

[^7_22]: https://github.com/postgrespro/tsvector2

[^7_23]: https://www.scribd.com/document/849358852/docs-nestjs-com-websockets-interceptors

[^7_24]: https://github.com/fastapi

[^7_25]: https://www.freecodecamp.org/news/the-nestjs-handbook-learn-to-use-nest-with-code-examples/

[^7_26]: https://tiangolo.com/projects/

[^7_27]: https://www.postgresql.org/docs/current/textsearch-features.html

[^7_28]: https://www.reddit.com/r/Nestjs_framework/comments/196uj4f/nestjs_docs_is_one_of_the_most_well_written_docs/

[^7_29]: https://github.com/pgvector/pgvector-java

[^7_30]: https://github.com/pgvector/pgvector-go

[^7_31]: https://github.com/pgvector/pgvector-rust

[^7_32]: https://www.postgresql.org/about/news/pgvector-070-released-2852/

[^7_33]: https://www.browserstack.com/guide/puppeteer-framework-tutorial

[^7_34]: https://www.npmjs.com/package/socket.io

[^7_35]: https://github.com/pgvector/pgvector-php

[^7_36]: https://developers.cloudflare.com/browser-rendering/platform/puppeteer/

[^7_37]: https://github.com/pgvector/pgvector-ruby

[^7_38]: https://socket.io/docs/v3/

[^7_39]: https://github.com/pgvector/pgvector-elixir

[^7_40]: https://devdocs.io/puppeteer/

[^7_41]: https://socket.io/docs/v2/index.html

[^7_42]: https://github.com/pgvector/pgvector-dart

[^7_43]: https://developer.chrome.com/docs/puppeteer

[^7_44]: https://devdocs.io/socketio/

[^7_45]: https://github.com/pgvector/pgvector-perl

[^7_46]: https://arxiv.org/abs/2404.10097

[^7_47]: https://arxiv.org/abs/2010.02559

[^7_48]: https://arxiv.org/abs/2211.00974

[^7_49]: https://python.langchain.com/docs/integrations/text_embedding/bge_huggingface/

[^7_50]: https://dev.to/railsstudent/queuing-jobs-in-nestjs-using-nestjsbullmq-package-55c1

[^7_51]: https://arxiv.org/abs/2303.05388

[^7_52]: https://stackoverflow.com/questions/75423621/nestjs-bull-queue-and-redis-in-production

[^7_53]: https://arxiv.org/abs/2407.00648

[^7_54]: https://huggingface.co/Teradata/bge-m3

[^7_55]: https://arxiv.org/abs/2209.06049

[^7_56]: https://huggingface.co/BAAI/bge-reranker-v2-m3

[^7_57]: https://docs.bullmq.io/guide/nestjs

[^7_58]: https://arxiv.org/html/2401.11207v1

[^7_59]: https://huggingface.co/deepvk/USER-bge-m3

[^7_60]: https://docs.bullmq.io

[^7_61]: https://huggingface.co/Shitao/bge-m3


---

# can you reduce the focus on monitors regulation sources

make the AI case linking and managing cases is the primary idea
basically i don't want to mention it's a web scrapping service

Absolutely—below is a revised proposal that shifts the primary focus to AI-powered case linking and case management, while keeping “regulation updates” as a data ingestion/versioning concept without mentioning web scraping; it uses NestJS + FastAPI + PostgreSQL with full‑text/vector search and clearly ties outcomes to the mobile app experience.[^8_1][^8_2]

## 1. Problem Statement

Legal teams in Saudi Arabia must rapidly interpret large volumes of Arabic case materials and determine which regulations and articles are most pertinent to each matter, but traditional keyword search often misses semantically relevant matches and slows decision-making. This project addresses that gap by delivering an AI‑first case management system that uses Arabic‑capable semantic embeddings to link each case to the most relevant regulations and versions, enabling practitioners to review, compare, and act with confidence. The solution integrates a modular backend and mobile app to manage cases securely, display AI‑ranked legal references, and maintain versioned regulatory context, improving accuracy, speed, and traceability in everyday legal workflows.[^8_2][^8_3][^8_1]

## 2. Project Aims and Objectives

Aim: Design and develop a functional prototype of an AI‑centric case management system that prioritizes case creation, tracking, and AI‑driven regulation linkage in Arabic, delivered through a Flutter app backed by NestJS APIs and a FastAPI AI service. Expected results include secure case CRUD, Arabic semantic similarity scoring for case‑to‑regulation linking, versioned regulation records, real‑time updates in the app, and fully documented APIs for seamless integration and testing.[^8_4][^8_1][^8_2]

Objectives:

- Evaluate Arabic and multilingual embedding models for legal similarity (e.g., AraLegal‑BERT and BGE‑M3) and select the best baseline for Saudi legal text linking.[^8_5][^8_1]
- Build a secure NestJS backend (JWT, role guards) with OpenAPI documentation and endpoints for cases, regulations, versions, and AI‑link requests.[^8_1][^8_2]
- Develop a Flutter app with BLoC state management and secure token handling to create/manage cases and display AI‑ranked, regulation links with scores and version context.[^8_6][^8_1]
- Implement a FastAPI microservice that generates embeddings and returns top‑N regulation matches per case, using cosine similarity and optional re‑ranking for precision.[^8_4][^8_1]
- Design a regulation data model with versioning and controlled ingestion (official sources, datasets, and curated imports) so linked regulations remain auditable without relying on scraping language or methods.[^8_1]
- Provide dual retrieval: lexical search via PostgreSQL full‑text (tsvector/tsquery) and semantic retrieval via vector search to maximize coverage and relevance in Arabic.[^8_1]
- Validate end‑to‑end behavior with test cases and measure link accuracy, latency, and usability to inform final refinements and presentation.[^8_2][^8_1]


## 3. Methodology

The system uses a modular architecture: NestJS powers typed REST APIs, authentication, and OpenAPI docs; a FastAPI service performs Arabic semantic embeddings and similarity; PostgreSQL stores cases, regulations, and versions with full‑text and vector indices for hybrid retrieval; and the Flutter app provides a unified, mobile‑first user experience. Required software includes NestJS, FastAPI, PostgreSQL with full‑text search and vector support, Docker for environments, and Flutter for the mobile client; all components are open‑source and can be integrated with officially available or curated regulatory materials via controlled data import and versioning processes. Each objective maps to a deliverable: the AI service computes embeddings and top‑N matches, the backend serves secure endpoints documented with Swagger/OpenAPI, PostgreSQL enables robust lexical and semantic search, and the app presents linked regulations alongside case details in Arabic. Risks include model selection and tuning for Arabic legal phrasing and evolving regulatory content; these are mitigated by evaluating Arabic‑specific embeddings, normalizing text for Arabic, and versioning regulation entries so that AI links remain explainable and auditable over time.[^8_5][^8_4][^8_2][^8_1]

## 4. Project Plan (Planning in 2025, Implementation 16 weeks in 2026)

Planning and design begin October–December 2025, followed by a 16‑week implementation starting January 2026; this schedule emphasizes AI linking and case management as the primary deliverables, with regulation data handled via controlled ingestion and versioning.[^8_2][^8_1]


| Phase | Dates | Milestones \& Tasks |
| :-- | :-- | :-- |
| Research \& Scoping | Oct 2025 | Review AI methods for Arabic legal similarity; identify available official or curated regulation data sources and define import/versioning scope; finalize core case‑first features [^8_1]. |
| System Architecture | Nov 2025 | Confirm service boundaries (NestJS API, FastAPI AI), security model, and data flow; finalize ERD for cases, regulations, and versions; define OpenAPI contracts [^8_1][^8_2]. |
| Prototyping \& Setup | Dec 2025 | Scaffold repos and Docker; bootstrap NestJS with OpenAPI docs and core entities; stand up FastAPI with /embed and /find_related endpoints; prepare sample Arabic datasets [^8_1][^8_4]. |

Implementation (16 weeks, 2026):


| Weeks | Dates (2026) | Milestones \& Tasks |
| :-- | :-- | :-- |
| 1–5 | Jan 5 – Feb 6 | Backend auth + case CRUD with OpenAPI; Flutter login/dashboard and case forms; AI baseline working for embeddings/similarity with Arabic text; initial Postgres schema and seed data [^8_1][^8_2]. |
| 6–10 | Feb 9 – Mar 13 | App→API→AI integration for AI‑linked regulations; implement regulation entities + versioning and controlled import; enable full‑text + vector search; real‑time updates for case link refresh events [^8_1][^8_1]. |
| 11–16 | Mar 16 – Apr 24 | End‑to‑end tests, accuracy and latency evaluation, ranking tweaks; UI polish; documentation and demo prep; finalize prototype packaging for presentation [^8_1][^8_2]. |

Notes:

- OpenAPI documentation in NestJS and the self‑documenting FastAPI service streamline parallel development and integration testing across the team and client app.[^8_2][^8_1]
- PostgreSQL full‑text search (tsvector/tsquery) complements vector similarity, enabling both lexical and semantic matching for Arabic legal text within one data store.[^8_1]
- Regulation data handling is framed as controlled ingestion and versioning to maintain an auditable legal knowledge base without relying on scraping terminology, keeping the narrative centered on AI case linking and case management.[^8_1]

References to frameworks and features (e.g., Swagger/OpenAPI in NestJS, FastAPI auto‑docs, PostgreSQL full‑text) are aligned with official documentation, ensuring the proposal reflects realistic, implementable practices for the targeted stack and deliverables.[^8_4][^8_2][^8_1]
<span style="display:none">[^8_10][^8_11][^8_12][^8_13][^8_14][^8_15][^8_16][^8_17][^8_18][^8_19][^8_20][^8_21][^8_22][^8_23][^8_24][^8_7][^8_8][^8_9]</span>

<div align="center">⁂</div>

[^8_1]: https://www.postgresql.org/docs/current/datatype-textsearch.html

[^8_2]: https://docs.nestjs.com/recipes/swagger

[^8_3]: https://huggingface.co/BAAI/bge-m3

[^8_4]: https://fastapi.tiangolo.com

[^8_5]: https://aclanthology.org/2022.nllp-1.31.pdf

[^8_6]: https://bloclibrary.dev

[^8_7]: https://docs.nestjs.com/openapi/other-features

[^8_8]: https://docs.nestjs.com/openapi/introduction

[^8_9]: https://trilon.io/blog/nestjs-swagger-tips-tricks

[^8_10]: https://8-0-0--docs-nestjs.netlify.app/openapi/introduction

[^8_11]: https://sevic.dev/notes/swagger-openapi-docs-nestjs/

[^8_12]: https://www.geeksforgeeks.org/python/fastapi-introduction/

[^8_13]: https://www.postgresql.org/docs/current/textsearch-controls.html

[^8_14]: https://dev.to/zsevic/documenting-rest-apis-with-openapi-docs-nestjsswagger-2554

[^8_15]: https://neon.com/postgresql/postgresql-indexes/postgresql-full-text-search

[^8_16]: https://blog.bitsrc.io/a-guide-to-nestjs-swagger-configuration-dec5f183b53?gi=2dbd436e24d0

[^8_17]: https://realpython.com/fastapi-python-web-apis/

[^8_18]: https://wanago.io/2022/02/14/api-nestjs-openapi-swagger/

[^8_19]: https://devdocs.io/fastapi/

[^8_20]: https://www.postgresql.org/docs/current/functions-textsearch.html

[^8_21]: https://dev.to/antoncodes/5-tips-for-better-swagger-docs-in-nestjs-ng9

[^8_22]: https://fastapi-tutorial.readthedocs.io

[^8_23]: https://www.postgresql.org/docs/current/textsearch-intro.html

[^8_24]: https://www.youtube.com/watch?v=4RMzl8k6dXg


---

# don't mind the search engine feature we probably not going to do it

and don't focus on arabic problem
and make the proposal abstract and simple with mentioning the basic technologies

Here’s a simplified, abstract proposal that centers the primary value on AI case linking and core case management, with basic technologies noted and minimal emphasis on regulation monitoring or search engine features.[^9_1][^9_2]

## Problem Statement

Legal teams need a faster, more reliable way to connect case facts and filings to the most relevant regulations and precedents, as manual review and keyword-based lookups are slow and error-prone in practice. The proposed solution is an intelligent case management system that prioritizes **AI case linking** and **case management**: a mobile app backed by a typed, documented API that stores cases, computes semantic similarity between case text and a curated regulation set, and displays top‑N relevant items directly in the case dashboard. The system uses a modular backend to ensure maintainability and straightforward integration, focusing on clear APIs and dependable data handling rather than broad web monitoring or specialized search engine features.[^9_2][^9_1]

## Project Aims and Objectives

Aim: Deliver a functional prototype that enables legal practitioners to manage cases and obtain AI‑generated related regulations/precedents per case within a clean, secure workflow, emphasizing simplicity, reliability, and clear interfaces. Expected outcomes include a documented backend API, a mobile application with case views and AI suggestions, and an independent AI service for embeddings and similarity scoring.[^9_1][^9_2]

Objectives:

- Implement a secure REST API for user auth and case CRUD using a structured backend framework (NestJS) with auto‑generated OpenAPI docs for easy client integration.[^9_2][^9_1]
- Build an AI microservice (FastAPI) that exposes endpoints for embeddings and “find related” results, encapsulating the similarity workflow behind stable contracts.[^9_3][^9_1]
- Create a mobile client (Flutter) that lists cases, shows details, and presents AI‑ranked related items with simple verification and bookmarking actions.[^9_1][^9_2]
- Maintain a curated regulations dataset stored relationally (PostgreSQL) and linked to cases, keeping the first release narrow and testable.[^9_4][^9_1]
- Optionally add real‑time UI updates via WebSockets for instant refresh on new AI suggestions or case edits in later iterations.[^9_5][^9_1]


## Methodology

The system adopts a modular architecture: a NestJS API for core case management, a FastAPI microservice for similarity, a PostgreSQL database for structured storage, and a Flutter app for delivery, keeping components independent and the surface area small for rapid iteration and testing. All technologies are mainstream and open‑source, enabling straightforward development, containerization, and deployment without specialized infrastructure or purchased datasets; the curated regulation set can be assembled from public sources to validate the AI linking workflow. Risks are addressed by scoping the MVP to case CRUD and AI linking first, validating API contracts through OpenAPI, and postponing nonessential features (e.g., large‑scale monitoring, advanced search) until after core usability is proven.[^9_3][^9_2][^9_1]

## Project Plan

| Phase | Dates | Milestones \& Tasks |
| :-- | :-- | :-- |
| Planning \& Scoping | Oct 2025 | Finalize feature scope emphasizing AI case linking and case management; define initial regulations dataset and evaluation criteria for AI suggestions [^9_1][^9_2]. |
| Architecture \& Design | Nov 2025 | Draft service boundaries (API vs. AI), data model, and OpenAPI contracts; outline mobile flows (login, case list/detail, related items) [^9_1][^9_2]. |
| Prototyping | Dec 2025 | Scaffold repositories; stand up NestJS with OpenAPI and FastAPI with /health and /embed; provision a small seed dataset to exercise the AI flow end‑to‑end [^9_1][^9_2]. |
| Weeks 1–4 | Jan 5–Jan 30, 2026 | Build auth and case CRUD; implement AI “find related” endpoint and wire it to the API; display suggestions in the mobile case detail [^9_1][^9_3]. |
| Weeks 5–8 | Feb 2–Feb 27, 2026 | Add feedback actions (verify/bookmark); refine ranking thresholds; polish OpenAPI docs and stabilize request/response models [^9_1][^9_2]. |
| Weeks 9–12 | Mar 2–Mar 27, 2026 | Usability fixes, performance passes, and error handling; optional addition of WebSocket updates for live UI refresh [^9_1][^9_5]. |
| Weeks 13–16 | Mar 30–Apr 24, 2026 | End‑to‑end testing, demo packaging, user guide, and presentation preparation; defer any regulation monitoring to a future phase if time remains [^9_1][^9_2]. |

Basic technologies: NestJS for the backend API and documentation, FastAPI for the AI microservice endpoints, PostgreSQL for relational storage, and Flutter for the mobile client, keeping the stack simple and focused on shipping AI‑assisted case work first.[^9_4][^9_2][^9_3][^9_1]
<span style="display:none">[^9_10][^9_11][^9_12][^9_13][^9_14][^9_15][^9_16][^9_17][^9_18][^9_19][^9_20][^9_21][^9_22][^9_6][^9_7][^9_8][^9_9]</span>

<div align="center">⁂</div>

[^9_1]: Project-Proposal-Form-CMS.docx.pdf

[^9_2]: https://docs.nestjs.com

[^9_3]: https://fastapi.tiangolo.com

[^9_4]: https://www.postgresql.org/docs/

[^9_5]: https://socket.io/docs/v4/

[^9_6]: https://nestjs.com

[^9_7]: https://github.com/nestjs/docs.nestjs.com

[^9_8]: https://www.scribd.com/document/849358852/docs-nestjs-com-websockets-interceptors

[^9_9]: https://www.reddit.com/r/Nestjs_framework/comments/qgxuur/nestjs_documentation/

[^9_10]: https://www.scribd.com/document/883389557/Fastapi-Tiangolo-Com-Tutorial

[^9_11]: https://www.postgresql.org/files/documentation/pdf/16/postgresql-16-A4.pdf

[^9_12]: https://x.com/nestframework/status/1822938111044698341?lang=ar-x-fm

[^9_13]: https://neon.com/postgresql/tutorial

[^9_14]: https://www.npmjs.com/package/@nestjs/core/v/10.4.19

[^9_15]: https://en.wikipedia.org/wiki/FastAPI

[^9_16]: https://hub.continue.dev/konrad1221/nestjs-docs

[^9_17]: https://tiangolo.com/projects/

[^9_18]: https://www.postgresql.org

[^9_19]: https://www.codemag.com/Article/1907081/Nest.js-Step-by-Step

[^9_20]: https://github.com/fastapi

[^9_21]: https://www.postgresql.org/about/

[^9_22]: https://codesandbox.io/p/github/naffiq/docs.nestjs.com/master


---

# To achieve this aim, we will complete the following objectives: ● Evaluate Arabic and multilingual embedding models for legal similarity (e.g., AraLegal‑BERT and BGE‑M3) and select the best baseline for Saudi legal text linking. ● Develop the Backend: Build a secure and reliable server using Nest.js that handles user data, cases, and communicates with the other parts of the system secured with JWT (Json Web Token). ● Create the Mobile App: Develop a user-friendly mobile application using Flutter for managing cases and interacting with the system. ● Build the AI Engine: Implement a Python-based AI model using BAAI/bge-m3 embeddings with BAAI/bge-reranker-v2-m3 for precise retrieval. Baseline models such as E5-large and Jina-v3 may also be tested as alternatives. ● Implement the Change Monitor: Create an automated service to detect and alert users about changes in legal regulations.

this is what i wrote in the project aims and objectives and this is the doctor's notes:
Summarize objectives. No need to list details about the tools to be used. These can be mentioned in the methodology section.

don't forget to use simple words as a non native english speaker last year college in computer science

Here is a simplified, tool‑agnostic rewrite that keeps the focus on AI case linking and core case management, using clear language and short points as requested.[^10_9]

### Objectives (summary)

- Evaluate and select a suitable approach for semantic similarity so the system can suggest related regulations for each case with good accuracy.[^10_9]
- Build a secure backend with clear APIs for user accounts, case records, and linking results, ensuring reliable data handling and access control.[^10_9]
- Deliver a simple mobile app that lets users create and manage cases, view AI suggestions, and confirm or dismiss links as needed.[^10_9]
- Maintain a curated, versioned set of regulations so links remain traceable over time and easy to review within the case view.[^10_9]
- Validate the system end‑to‑end with usability checks and basic quality metrics (e.g., relevance, response time), then prepare the demo and documentation.[^10_9]


### Paste‑ready version

The project aims to build a practical case management system where AI helps link each case to the most relevant regulations in a clear, simple workflow. The objectives are to: choose an effective method for text similarity; develop a secure backend with clean APIs; create a mobile app for case tasks and reviewing AI suggestions; keep a curated, versioned regulation set for audit; and test the full flow for usefulness and speed before the final demo.[^10_9]

### Note

Details about specific models, frameworks, and implementation steps will be described in the methodology section, not in the objectives, as advised by the supervisor’s note.[^10_9]
<span style="display:none">[^10_1][^10_2][^10_3][^10_4][^10_5][^10_6][^10_7][^10_8]</span>

<div align="center">⁂</div>

[^10_1]: https://www.mycase.com/blog/legal-case-management/legal-case-management-software-101-all-you-need-to-know/

[^10_2]: https://zenkins.com/case-studies/legal-case-management-software-a-case-study/

[^10_3]: https://www.sciencedirect.com/topics/computer-science/case-management-system

[^10_4]: https://radixweb.com/blog/legal-case-management-software-guide

[^10_5]: https://enlargement.ec.europa.eu/document/download/1e1bee7f-336f-4d33-b0fa-7e8e76c940b6_en?filename=ipa_2007_07_judiciary_case_management__en.pdf

[^10_6]: https://en.wikipedia.org/wiki/Legal_case_management

[^10_7]: https://www.usu-digitalconsulting.com/en-us/consulting/case-management-software/

[^10_8]: https://www.scribd.com/document/250664690/Legal-Case-Management-System

[^10_9]: Project-Proposal-Form-CMS.docx.pdf


---

# ok for methodology i wrote this:

We will use an Agile development approach, working in short cycles to build and test our system incrementally. Our primary resource will be publicly available legal and regulatory websites, which we will access using a custom web scraper. The core of our solution is an AI model based on semantic search; we chose this approach because it is highly effective at understanding the meaning of text, not just keywords. To achieve our objectives, we need the following:
● Software: Node.js (Nest.js), Flutter, Python, PostgreSQL for the database, and Docker for managing our services.
● Expertise \& Data: The AI engine will use BAAI/bge-m3 embeddings with BAAI/bge-reranker-v2-m3 to ensure accurate retrieval of Arabic legal texts.
● Potential Barriers: Risks include model selection and tuning for Arabic legal phrasing and evolving regulatory content

and this is the doctor's notes about it:
Methodology needs more clarification. List the methodology as stages that will be followed in your GP journey. For example: Step 1: Requirments Collection, Step 2: build AI model, ... etc. In each step you can mention details about tools and techniques to be implemented.

Here is a clear, step‑by‑step methodology with simple wording, where each stage lists what will be done and the main tools we plan to use (tools are examples and may be adjusted as we iterate).[^11_11]

## Methodology (stages)

- We will follow short Agile cycles and review results at the end of every sprint to keep the scope focused and the app usable early.[^11_11]
- Each step below has simple tasks and the tools or techniques we will use to complete them in a practical way.[^11_11]


### Step 1: Requirements and scope

- Meet stakeholders, list core user stories (create case, view case, see suggested related regulations), and define success metrics (relevance and response time).[^11_11]
- Agree on a small curated set of regulations to start, and define how we will import and version them inside the system (no external crawling needed).[^11_11]
- Deliverables: short scope document, acceptance criteria, and a small sample dataset for testing end‑to‑end.[^11_11]


### Step 2: Data model and sample dataset

- Design a simple schema for cases, regulations, regulation_versions, and case_regulation_links, keeping fields minimal for v1 and easy to extend later.[^11_11]
- Prepare a small, clean dataset of regulations and a few example cases to validate AI suggestions and the app screens.[^11_11]
- Tools: PostgreSQL for tables and constraints; seed scripts for sample data.[^11_11]


### Step 3: System setup and environments

- Create repositories, Docker setup, and environments (dev/test) so the team can run the full system locally and in a shared test space.[^11_11]
- Add CI steps for formatting, linting, and simple tests to keep the codebase stable as the team commits changes.[^11_11]
- Tools: Docker, basic CI workflow, environment variables for service config.[^11_11]


### Step 4: Backend API (NestJS)

- Build secure REST endpoints for auth and case CRUD, plus endpoints to fetch regulations and saved links, with clear request/response models.[^11_11]
- Add role checks and input validation, and publish OpenAPI (Swagger) docs to speed up mobile integration and testing.[^11_11]
- Tools: NestJS, JWT for auth, OpenAPI docs generation.[^11_11]


### Step 5: AI service (FastAPI) for similarity

- Expose two simple endpoints: “/embed” to create embeddings and “/find_related” to return top suggestions for a given case text.[^11_11]
- Start with one strong embedding model as the baseline and keep a switch to test an alternative model if needed, measuring quality and latency.[^11_11]
- Tools: FastAPI, sentence‑transformers, cosine similarity, simple logging for timing.[^11_11]


### Step 6: Database storage and linking

- Store cases and regulations in PostgreSQL and save AI suggestions as case_regulation_links with a score and a “verified” flag for user feedback.[^11_11]
- Keep regulation_versions to preserve history and allow users to see what changed and when, without depending on any external collectors.[^11_11]
- Tools: PostgreSQL tables, indexes for common queries, migration scripts.[^11_11]


### Step 7: Mobile app (Flutter)

- Build basic screens: login, case list, case details, and a “Related Regulations” section with scores and simple actions (verify, bookmark).[^11_11]
- Use clear error messages, loading states, and a simple layout so users can test the flow quickly and give feedback.[^11_11]
- Tools: Flutter, BLoC (or similar) for state, secure token storage, HTTP client for the API.[^11_11]


### Step 8: Integration and real‑time UX (optional)

- Connect the app to the backend and the backend to the AI service, then test the full flow from creating a case to viewing AI suggestions.[^11_11]
- Optionally add a lightweight real‑time update (for example, when new links are saved) so the app can refresh the case view without manual reloads.[^11_11]
- Tools: simple event endpoint or a socket channel, API integration tests.[^11_11]


### Step 9: Quality checks and tuning

- Measure suggestion relevance (small manual review set), response time, and error rates; then adjust thresholds and the top‑N list size for a better user experience.[^11_11]
- Add unit tests and a few end‑to‑end tests for the main flows (login, create case, get related regulations, verify link).[^11_11]
- Tools: basic metrics logging, unit/E2E tests, small user feedback rounds.[^11_11]


### Step 10: Delivery and documentation

- Prepare a short user guide (how to create a case and read suggestions), API docs link, and deployment notes for the prototype.[^11_11]
- Finalize a demo scenario that shows the main value: create a case, see suggested regulations, verify one link, and view the regulation’s version info in context.[^11_11]
- Tools: README, short slides with screenshots, recorded demo (if needed).[^11_11]

This staged plan keeps the focus on the main idea—AI linking and managing cases—while giving enough detail on tools and steps so the work is clear, testable, and doable within a student project timeline.[^11_11]
<span style="display:none">[^11_1][^11_10][^11_2][^11_3][^11_4][^11_5][^11_6][^11_7][^11_8][^11_9]</span>

<div align="center">⁂</div>

[^11_1]: https://caretlegal.com/blog/how-to-improve-your-legal-case-management-workflow/

[^11_2]: https://softhealer.com/blog/articals-11/understanding-the-legal-case-management-process-in-law-firms-12784

[^11_3]: https://www.lexisnexis.com/community/insights/legal/counsellink/b/counsellink/posts/what-is-legal-case-management

[^11_4]: https://www.legalfutures.co.uk/associate-news/the-essential-guide-to-case-management-systems-in-legal-practices

[^11_5]: https://www.opus2.com/legal-case-management-workflow/

[^11_6]: https://www.whispli.com/case-management-system/

[^11_7]: https://www.mycase.com/blog/legal-case-management/legal-case-management-software-101-all-you-need-to-know/

[^11_8]: https://www.hoowla.com/breaking-down-case-management-system-adoption-with-6-steps/

[^11_9]: https://www.gatekeeperhq.com/blog/legal-spotlight-6-steps-for-effective-litigation-case-management

[^11_10]: https://legal.thomsonreuters.com/en/insights/articles/how-to-bring-new-legal-case-management-software-to-your-firm

[^11_11]: Project-Proposal-Form-CMS.docx.pdf


---

# for the AI part

what about using cosine algorithm (SCA) or something

Short answer: Yes—use cosine similarity for the first stage of AI case–regulation linking; it’s the standard metric for embedding-based semantic matching and is supported natively by common vector backends like pgvector and Qdrant, with an optional cross‑encoder re‑ranker to boost top‑K precision when needed.[^12_1][^12_2][^12_3]

### What “cosine” means and why it fits

- Cosine similarity measures the angle between two embedding vectors, which correlates well with semantic closeness for sentence embeddings used in legal text linking.[^12_4]
- The formula is \$ \cos(\mathbf{u}, \mathbf{v}) = \frac{\mathbf{u}\cdot \mathbf{v}}{\|\mathbf{u}\|\,\|\mathbf{v}\|} \$ and many systems use cosine distance $1 - \cos(\cdot)$ for nearest‑neighbor search indices [^12_1].


### How to apply it in your pipeline

- Generate embeddings for cases and regulations with your chosen model, store them, and retrieve top‑K by cosine similarity at query time to propose related regulations per case.[^12_5]
- Normalize vectors once at ingest, then use cosine or inner product consistently; vector stores like pgvector and Qdrant let you select cosine as the distance metric and build ANN indexes for speed (e.g., HNSW).[^12_2][^12_1]


### Practical settings

- Postgres/pgvector: create a vector column and an HNSW index with cosine ops (vector_cosine_ops) to get fast approximate nearest‑neighbor search inside your main database.[^12_1]
- Qdrant (optional): collections can be configured with distance=Cosine and payload filters, which makes scaling and hybrid retrieval straightforward later on.[^12_2]


### When to add a re‑ranker

- If top‑K results need higher precision, run a cross‑encoder re‑ranker on the retrieved candidates; this scores each query–document pair directly and reliably improves the first positions shown to users.[^12_3]


### Model notes

- Modern embedding models (e.g., BGE‑M3) are designed for dense retrieval and work well with cosine similarity; start with cosine for recall and add re‑ranking only if evaluations show you need tighter precision.[^12_3][^12_5]


### Summary recommendation

- Use cosine similarity for embedding retrieval as the default, index it with pgvector (or Qdrant if you outgrow Postgres), and add a cross‑encoder re‑ranker only after measuring whether your top‑K needs extra precision for the final user experience.[^12_1][^12_2][^12_3]

<div align="center">⁂</div>

[^12_1]: https://github.com/pgvector/pgvector

[^12_2]: https://qdrant.tech/documentation/

[^12_3]: https://www.sbert.net/docs/pretrained-models/ce-msmarco.html

[^12_4]: https://www.sbert.net/docs/sentence_transformer/pretrained_models.html

[^12_5]: https://huggingface.co/BAAI/bge-m3


---

# what about quen models?

this:
[https://qwen.ai/home](https://qwen.ai/home)

**Short answer**: Qwen models (especially Qwen2.5 and Qwen3) are strong multilingual LLMs with solid Arabic support and can be used for text understanding, chat, and generation, but they are **primarily generative (causal) models** rather than specialized embedding models—so for your legal case–regulation linking use case, you'll still want a dedicated sentence‑embedding model like BGE‑M3, and optionally use Qwen for reranking or chat‑based explanations on top of the retrieved results.[^13_1][^13_2][^13_3]

## What Qwen offers

- **Multilingual coverage**: Qwen2.5 and Qwen3 support 100+ languages including Arabic with strong performance, making them useful for chat, instruction following, and text generation in Saudi legal contexts.[^13_4][^13_5][^13_6]
- **Model sizes**: Available in 0.5B to 72B+ (and MoE variants), so you can pick a size that fits your deployment budget and latency needs.[^13_6][^13_7]
- **Arabic capabilities**: Qwen3-8B and similar models demonstrate excellent Arabic performance for reasoning, translation, and dialogue, and there are community fine‑tuned variants like "Qwen-Arabic" optimized for Arabic tasks.[^13_8][^13_9][^13_4]


## Embeddings vs. generative use

- **Not an embedding model by default**: Qwen models are causal LLMs (autoregressive, next‑token prediction) and do not natively produce sentence embeddings; attempts to use them for embeddings require removing the LM head and further fine‑tuning, as shown by community experiments.[^13_2][^13_10][^13_11][^13_1]
- **Better for reranking or generation**: If you want to use Qwen in your pipeline, consider it for a **cross‑encoder reranker** (score pairs directly) or for **chat‑based explanations** of why a regulation is relevant to a case, rather than the first‑stage embedding retrieval.[^13_5]


## Recommended architecture for your project

1. **First‑stage retrieval**: Use a dedicated embedding model like **BGE‑M3** or **AraLegal‑BERT** to generate dense vectors for cases and regulations, then retrieve top‑K via cosine similarity in pgvector or Qdrant.[^13_3][^13_12][^13_13]
2. **Optional reranking**: If you need higher precision at the top ranks, apply a cross‑encoder (e.g., BGE‑reranker‑v2‑m3) or even a small Qwen model fine‑tuned for pairwise scoring to rerank the top candidates.[^13_14][^13_5]
3. **Chat/explanations**: Use a Qwen2.5 or Qwen3 instruct model to generate natural‑language summaries or justifications of the AI‑suggested links, giving users richer context in Arabic about why each regulation is relevant.[^13_5][^13_6]

## Community embedding experiments

- Some developers have experimented with Qwen2.5‑based embeddings by removing the LM head and using sentence‑transformers wrappers, but results indicate these need further fine‑tuning to match purpose‑built embedding models like E5 or BGE.[^13_10][^13_1][^13_2]
- For production retrieval, stick with models designed for embeddings (BGE‑M3, multilingual‑E5, AraLegal‑BERT) and reserve Qwen for downstream tasks where its generative and reasoning strengths shine.[^13_12][^13_15][^13_3]


## Practical summary

- **For AI case linking (embeddings + similarity)**: Use BGE‑M3 or similar dedicated embeddings with cosine similarity; Qwen is not optimized for this out‑of‑the‑box.[^13_13][^13_3]
- **For enhanced UX (chat, explanations)**: Optionally add a Qwen2.5 or Qwen3 instruct model to generate readable summaries or answer follow‑up questions about the retrieved regulations in Arabic.[^13_6][^13_5]
- **For reranking**: A fine‑tuned Qwen or a dedicated reranker like BGE‑reranker‑v2‑m3 can boost top‑K precision after the initial embedding retrieval.[^13_14][^13_5]

So Qwen is a great choice if you want to add conversational AI features, but keep your core similarity engine on a proper embedding model for reliability and performance in the legal linking workflow.
<span style="display:none">[^13_16][^13_17][^13_18][^13_19][^13_20][^13_21][^13_22][^13_23][^13_24][^13_25]</span>

<div align="center">⁂</div>

[^13_1]: https://huggingface.co/ssmits/Qwen2.5-7B-Instruct-embed-base

[^13_2]: https://huggingface.co/ssmits/Qwen2.5-7B-embed-base

[^13_3]: https://huggingface.co/BAAI/bge-m3

[^13_4]: https://www.siliconflow.com/articles/en/best-open-source-LLM-for-Arabic

[^13_5]: https://qwen.readthedocs.io

[^13_6]: https://qwen.readthedocs.io/en/stable/

[^13_7]: https://huggingface.co/Qwen/Qwen2.5-0.5B

[^13_8]: https://github.com/prakash-aryan/qwen-arabic-project

[^13_9]: https://ollama.com/prakasharyan/qwen-arabic

[^13_10]: https://www.reddit.com/r/ollama/comments/1gef3d5/using_qwen2_or_even_25_to_generate_embeddings_in/

[^13_11]: https://github.com/vllm-project/vllm/issues/9761

[^13_12]: https://aclanthology.org/2022.nllp-1.31.pdf

[^13_13]: https://github.com/pgvector/pgvector

[^13_14]: https://huggingface.co/BAAI/bge-reranker-v2-m3

[^13_15]: https://huggingface.co/intfloat/multilingual-e5-large

[^13_16]: https://aws.amazon.com/blogs/machine-learning/how-to-run-qwen-2-5-on-aws-ai-chips-using-hugging-face-libraries/

[^13_17]: https://qwenlm.github.io

[^13_18]: https://local-ai-zone.github.io/brands/qwen-ai-alibaba-multilingual-guide-2025.html

[^13_19]: https://www.oneclickitsolution.com/centerofexcellence/aiml/guide-for-running-qwen-2-5-locally-using-hugging-face

[^13_20]: https://qwen.readthedocs.io/en/stable/inference/chat.html

[^13_21]: https://huggingface.co/Qwen

[^13_22]: https://huggingface.co/docs/transformers/en/model_doc/qwen2

[^13_23]: https://arxiv.org/abs/2503.20215

[^13_24]: https://github.com/QwenLM/Qwen3

[^13_25]: https://zilliz.com/tutorials/rag/langchain-and-milvus-and-nvidia-qwen2.5-7b-instruct-and-openai-text-embedding-3-large


---

# ok about backend what about using fastify instead of nest.js

because i didn't like nest.js

**Short answer**: Yes, you can absolutely use **Fastify** instead of NestJS for your backend—it's a great choice if you prefer a lightweight, high-performance framework with a simpler, more flexible approach and strong TypeScript support. Fastify is one of the fastest Node.js frameworks and gives you full control without forcing an opinionated structure, making it ideal if you want to build a clean, fast API without the overhead of NestJS's architecture.[^14_1][^14_2][^14_3][^14_4][^14_5]

## Why Fastify is a solid choice for your project

**Performance**: Fastify is significantly faster than Express and competitive with or better than most Node.js frameworks, thanks to optimized routing, fast JSON parsing/serialization, and async-first design.[^14_2][^14_4]
**TypeScript-first**: Fastify has excellent TypeScript support with strong generic typing for routes, schemas, request/reply objects, and plugins—often better than Express and comparable to NestJS.[^14_3][^14_5]
**Minimal and flexible**: Unlike NestJS's opinionated modules/controllers/DI structure, Fastify is unopinionated and gives you freedom to organize code however you want, which fits well if you didn't enjoy NestJS's "everything has a decorator" style.[^14_4][^14_2]
**Plugin ecosystem**: Fastify has a robust plugin system and supports many integrations (databases, auth, validation, WebSockets, etc.) while staying lean and fast.[^14_1][^14_2]
**Schema validation \& serialization**: Built-in JSON schema validation and response serialization with automatic type inference makes API contracts clear and catches errors early without extra libraries.[^14_6][^14_1]

## Fastify vs NestJS quick comparison

| Aspect | Fastify | NestJS |
| :-- | :-- | :-- |
| **Performance** | Very fast, optimized for high throughput [^14_2] | Good, but slower than Fastify (built on Express by default) [^14_2] |
| **Structure** | Minimal, flexible, you choose your architecture [^14_4] | Opinionated, enforces modules/controllers/DI [^14_2] |
| **Learning curve** | Easier for simple APIs, no complex abstractions [^14_2] | Steeper, requires understanding Angular-style patterns [^14_2] |
| **TypeScript** | Excellent native support with generics [^14_3][^14_5] | Great support but more decorators and metadata [^14_2] |
| **Best for** | High-performance APIs, microservices, flexible setups [^14_2] | Large teams, enterprise apps needing structure [^14_2] |

## How to structure a Fastify project for your case management system

Here's a clean, maintainable structure that works well for a student graduation project :[^14_7][^14_8][^14_9]

```
project-root/
├── src/
│   ├── app.ts                 # Fastify app factory
│   ├── server.ts              # Server startup
│   ├── config/                # Environment and config
│   │   └── env.ts
│   ├── plugins/               # Fastify plugins (auth, DB, etc.)
│   │   ├── auth.ts
│   │   ├── database.ts
│   │   └── swagger.ts
│   ├── routes/                # Route handlers by feature
│   │   ├── auth/
│   │   │   └── index.ts
│   │   ├── cases/
│   │   │   ├── index.ts
│   │   │   ├── schemas.ts
│   │   │   └── handlers.ts
│   │   └── regulations/
│   │       └── index.ts
│   ├── services/              # Business logic
│   │   ├── case.service.ts
│   │   ├── ai.service.ts      # Calls FastAPI AI service
│   │   └── regulation.service.ts
│   ├── types/                 # TypeScript types/interfaces
│   │   └── index.ts
│   └── utils/                 # Helpers and utilities
│       └── logger.ts
├── test/
├── package.json
└── tsconfig.json
```


## Basic Fastify setup for your backend

**Install dependencies**:

```bash
npm init -y
npm install fastify @fastify/jwt @fastify/swagger @fastify/cors
npm install -D typescript @types/node tsx
```

**Simple server with TypeScript** :[^14_5]

```typescript
// src/app.ts
import Fastify from 'fastify';
import swagger from '@fastify/swagger';
import jwt from '@fastify/jwt';
import cors from '@fastify/cors';

export function buildApp(opts = {}) {
  const app = Fastify({
    logger: true,
    ...opts
  });

  // Register plugins
  app.register(cors);
  app.register(jwt, { secret: process.env.JWT_SECRET || 'supersecret' });
  app.register(swagger, {
    openapi: {
      info: {
        title: 'Legal Case Management API',
        version: '1.0.0'
      }
    }
  });

  // Register routes
  app.register(import('./routes/auth'), { prefix: '/api/auth' });
  app.register(import('./routes/cases'), { prefix: '/api/cases' });
  app.register(import('./routes/regulations'), { prefix: '/api/regulations' });

  return app;
}

// src/server.ts
import { buildApp } from './app';

const start = async () => {
  try {
    const app = buildApp();
    await app.listen({ port: 3000, host: '0.0.0.0' });
    console.log('Server running on http://localhost:3000');
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

start();
```

**Route example with schema validation** :[^14_6][^14_1]

```typescript
// src/routes/cases/index.ts
import { FastifyPluginAsync } from 'fastify';
import { createCaseSchema, getCasesSchema } from './schemas';

const casesRoute: FastifyPluginAsync = async (fastify) => {
  // Get all cases
  fastify.get('/', {
    schema: getCasesSchema,
    preHandler: [fastify.authenticate] // JWT guard
  }, async (request, reply) => {
    const cases = await fastify.caseService.getAll(request.user.id);
    return { cases };
  });

  // Create case
  fastify.post('/', {
    schema: createCaseSchema,
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const newCase = await fastify.caseService.create(request.body);
    return { case: newCase };
  });

  // Get AI links for a case
  fastify.post('/:id/ai-links', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { id } = request.params;
    const links = await fastify.aiService.findRelatedRegulations(id);
    return { links };
  });
};

export default casesRoute;
```

**Schema definitions for auto-validation and OpenAPI** :[^14_1]

```typescript
// src/routes/cases/schemas.ts
export const createCaseSchema = {
  body: {
    type: 'object',
    required: ['title', 'description'],
    properties: {
      title: { type: 'string' },
      description: { type: 'string' },
      case_type: { type: 'string' }
    }
  },
  response: {
    200: {
      type: 'object',
      properties: {
        case: {
          type: 'object',
          properties: {
            id: { type: 'number' },
            title: { type: 'string' },
            created_at: { type: 'string' }
          }
        }
      }
    }
  }
};
```


## Key advantages for your graduation project

1. **Simpler for a 3-person team**: No complex DI or decorator patterns—just clean functions and plugins that are easy to understand and split work.[^14_2][^14_4]
2. **Fast development**: Less boilerplate than NestJS means you can ship features faster and iterate quickly.[^14_2]
3. **Great docs and examples**: Fastify documentation is clear and has many real-world examples for TypeScript projects.[^14_10][^14_5][^14_1]
4. **Auto-generated OpenAPI**: Built-in Swagger/OpenAPI generation makes it easy to document your API for the Flutter developer and professors.[^14_1]
5. **Performance demo**: You can show impressive performance metrics in your presentation compared to Express-based solutions.[^14_11][^14_2]

## What you'll miss from NestJS (and how to handle it)

| NestJS Feature | Fastify Alternative |
| :-- | :-- |
| Dependency Injection | Use `fastify.decorate()` to share services or simple imports [^14_1] |
| Guards \& Interceptors | Use `preHandler` hooks for auth/validation [^14_1] |
| Auto module scanning | Manual route registration (actually simpler!) [^14_5] |
| Batteries-included | Add only what you need via plugins (leaner) [^14_1] |

## Bottom line

**Use Fastify** if you want:

- A faster, lighter backend with less magic and more control
- Clean TypeScript code without heavy decorators
- Easier learning for team members who find NestJS overwhelming
- Better raw performance for your demo and future scaling

**Stick with NestJS** only if:

- Your team really wants enforced structure and Angular-style patterns
- You need the "enterprise framework" brand for the project presentation

Given your preference and the project scope, **Fastify is an excellent choice** and will make your development experience much smoother while delivering a high-quality, performant backend for your case management system.[^14_4][^14_5][^14_2]
<span style="display:none">[^14_12][^14_13][^14_14][^14_15][^14_16][^14_17][^14_18][^14_19][^14_20]</span>

<div align="center">⁂</div>

[^14_1]: https://fastify.io/docs/v5.1.x/Reference/

[^14_2]: https://betterstack.com/community/guides/scaling-nodejs/nestjs-vs-fastify/

[^14_3]: https://fastify.io/docs/latest/Reference/TypeScript/

[^14_4]: https://stackshare.io/stackups/fastify-vs-nestjs

[^14_5]: https://fastify.dev/docs/latest/Reference/TypeScript/

[^14_6]: https://fastify.io/docs/v1.14.x/Documentation/Getting-Started/

[^14_7]: https://krython.com/tutorial/typescript/fastify-with-typescript-high-performance-server/

[^14_8]: https://dev.to/claranet/exploring-fastify-and-typescript-mocking-external-dependencies-30ja

[^14_9]: https://www.reddit.com/r/node/comments/193328x/wellstructured_scalable_fastify_project_with/

[^14_10]: https://fastify.io/docs/latest/

[^14_11]: https://www.youtube.com/watch?v=Pto4Naos5Lo

[^14_12]: https://fastify.io/docs/v5.6.x/Reference/Server/

[^14_13]: https://www.linkedin.com/pulse/fastify-vs-nestjs-tojo-rodialson-nmr6e

[^14_14]: https://www.reddit.com/r/node/comments/1bsbjcp/fastify_or_fastify_nestjs/

[^14_15]: https://www.youtube.com/watch?v=OT-JkqdhODU

[^14_16]: https://www.reddit.com/r/Nestjs_framework/comments/1droehw/express_vs_fastify/

[^14_17]: https://fastify.io/docs/latest/Guides/Getting-Started/

[^14_18]: https://www.youtube.com/watch?v=Vuol3MTTH-E

[^14_19]: https://www.reddit.com/r/node/comments/17269wx/fastify_project_example_with_good_structure/

[^14_20]: https://fastify.io/docs/v5.6.x/Guides/


---


<div align="center">⁂</div>

[^15_1]: Project-Proposal-Form-CMS.docx.pdf

