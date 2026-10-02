-- Candidate career profile, job openings, and 1-click application tracking pipeline.
CREATE TABLE candidate_profiles (
    id                  bigserial PRIMARY KEY,
    user_id             bigint NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
    headline            text NOT NULL DEFAULT '',
    years_of_experience numeric(4, 1) NOT NULL DEFAULT 0.0,
    current_company     text NOT NULL DEFAULT '',
    current_role        text NOT NULL DEFAULT '',
    current_ctc         text NOT NULL DEFAULT '',
    expected_ctc        text NOT NULL DEFAULT '',
    notice_period_days  integer NOT NULL DEFAULT 30,
    preferred_locations text NOT NULL DEFAULT '',
    resume_url          text NOT NULL DEFAULT '',
    resume_summary      text NOT NULL DEFAULT '',
    skills              text NOT NULL DEFAULT '',
    certifications      text NOT NULL DEFAULT '',
    education           text NOT NULL DEFAULT '',
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_candidate_profiles_user ON candidate_profiles (user_id);

CREATE TABLE job_openings (
    id                  bigserial PRIMARY KEY,
    title               text NOT NULL,
    company             text NOT NULL,
    company_logo_url    text NOT NULL DEFAULT '',
    location            text NOT NULL,
    experience_min      integer NOT NULL DEFAULT 0,
    experience_max      integer NOT NULL DEFAULT 10,
    salary_range        text NOT NULL DEFAULT 'Competitive',
    job_type            text NOT NULL DEFAULT 'FULL_TIME',
    workplace_type      text NOT NULL DEFAULT 'HYBRID',
    required_skills     text NOT NULL,
    description         text NOT NULL,
    external_apply_url  text NOT NULL DEFAULT '',
    is_active           boolean NOT NULL DEFAULT true,
    openings_count      integer NOT NULL DEFAULT 1,
    posted_at           timestamptz NOT NULL DEFAULT now(),
    created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_job_openings_active ON job_openings (is_active, posted_at DESC);
CREATE INDEX idx_job_openings_exp ON job_openings (experience_min, experience_max);

CREATE TABLE job_applications (
    id              bigserial PRIMARY KEY,
    user_id         bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    job_id          bigint NOT NULL REFERENCES job_openings (id) ON DELETE CASCADE,
    status          text NOT NULL DEFAULT 'APPLIED'
        CHECK (status IN ('APPLIED', 'UNDER_REVIEW', 'SHORTLISTED', 'INTERVIEW', 'REJECTED', 'OFFERED')),
    match_score     integer NOT NULL DEFAULT 0,
    notes           text NOT NULL DEFAULT '',
    applied_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_user_job_application UNIQUE (user_id, job_id)
);

CREATE INDEX idx_job_applications_user ON job_applications (user_id, applied_at DESC);
CREATE INDEX idx_job_applications_job ON job_applications (job_id, applied_at DESC);

-- Seed realistic curated tech openings
INSERT INTO job_openings (id, title, company, company_logo_url, location, experience_min, experience_max, salary_range, job_type, workplace_type, required_skills, description, external_apply_url) VALUES
(1, 'Software Development Engineer - II (Java / Spring Boot)', 'Amazon', 'https://upload.wikimedia.org/wikipedia/commons/4/4a/Amazon_icon.svg', 'Bengaluru, India', 2, 6, '₹28 - ₹42 LPA', 'FULL_TIME', 'HYBRID', 'Java, Spring Boot, Microservices, System Design, DSA, AWS, DynamoDB', 'Join Amazon Consumer Payments team to architect ultra-low-latency transaction engines. Requires strong foundation in Java, Spring Boot, multithreading, distributed caching, and problem solving.', 'https://amazon.jobs'),
(2, 'Senior Backend Engineer (Microservices)', 'Swiggy', 'https://upload.wikimedia.org/wikipedia/en/1/12/Swiggy_logo.svg', 'Bengaluru, India', 3, 7, '₹30 - ₹50 LPA', 'FULL_TIME', 'REMOTE', 'Java, Spring Boot, Kafka, Redis, PostgreSQL, Distributed Systems, DSA', 'Help power Indias largest food delivery network. You will own high-throughput order dispatch services handling 20,000+ RPS during peak dining hours.', 'https://careers.swiggy.com'),
(3, 'Full Stack Developer (Java + Angular)', 'JPMorgan Chase & Co.', 'https://upload.wikimedia.org/wikipedia/commons/a/af/J_P_Morgan_Logo_2008_1.svg', 'Bengaluru / Hyderabad', 2, 5, '₹18 - ₹28 LPA', 'FULL_TIME', 'HYBRID', 'Java, Spring Boot, Angular, TypeScript, REST APIs, SQL, Docker', 'Develop and modernize wealth management and corporate banking trading portals with Angular on the frontend and Spring Boot microservices on the backend.', 'https://careers.jpmorgan.com'),
(4, 'Software Engineer (Java / Cloud)', 'PhonePe', 'https://upload.wikimedia.org/wikipedia/commons/7/71/PhonePe_Logo.svg', 'Bengaluru, India', 1, 4, '₹22 - ₹36 LPA', 'FULL_TIME', 'ON_SITE', 'Java, Spring Boot, DSA, System Design, MySQL, Kafka, Redis', 'Build payment gateway interfaces, UPI routing components, and settlement reconciliation pipelines with sub-50ms latency guarantees.', 'https://www.phonepe.com/careers/'),
(5, 'Senior Software Engineer (Frontend / Angular)', 'Oracle', 'https://upload.wikimedia.org/wikipedia/commons/5/50/Oracle_logo.svg', 'Bengaluru / Pune / Hyderabad', 3, 6, '₹24 - ₹38 LPA', 'FULL_TIME', 'HYBRID', 'Angular, TypeScript, JavaScript, HTML5, CSS3, RxJS, REST APIs', 'Oracle Cloud Infrastructure (OCI) Console team is looking for passionate Angular engineers to craft high-performance cloud management dashboards.', 'https://www.oracle.com/corporate/careers/'),
(6, 'Backend Engineer - Fintech', 'Razorpay', 'https://upload.wikimedia.org/wikipedia/commons/8/89/Razorpay_logo.svg', 'Bengaluru, India', 2, 5, '₹25 - ₹40 LPA', 'FULL_TIME', 'HYBRID', 'Java, Spring Boot, DSA, System Design, Microservices, AWS, PostgreSQL', 'Scale Indias leading neo-banking and merchant checkout platform. Handle card tokenization, recurring mandates, and fraud detection algorithms.', 'https://razorpay.com/jobs/'),
(7, 'Systems Engineer / Java Developer', 'Tata Consultancy Services (TCS)', 'https://upload.wikimedia.org/wikipedia/commons/b/b1/Tata_Consultancy_Services_Logo.svg', 'Pune / Bengaluru / Hyderabad / Gurugram', 1, 4, '₹6 - ₹12 LPA', 'FULL_TIME', 'HYBRID', 'Java, Spring Boot, SQL, REST APIs, Git, Angular', 'Work on enterprise digital transformation projects for global Fortune 500 banking and retail clients. Strong opportunities for offshore-onshore rotation.', 'https://www.tcs.com/careers'),
(8, 'Software Engineer - Distributed Systems', 'Microsoft', 'https://upload.wikimedia.org/wikipedia/commons/9/96/Microsoft_logo_%282012%29.svg', 'Hyderabad / Bengaluru / Noida', 2, 5, '₹32 - ₹48 LPA', 'FULL_TIME', 'HYBRID', 'Java, C++, DSA, System Design, Azure, Microservices, Kubernetes', 'Design and implement resilient cloud data storage fabrics in Microsoft Azure. Focus on distributed consensus (Raft/Paxos), replication, and high fault tolerance.', 'https://careers.microsoft.com'),
(9, 'Full Stack Engineer (Java + Modern Web)', 'Zomato', 'https://upload.wikimedia.org/wikipedia/commons/b/bd/Zomato_Logo.svg', 'Gurugram, India', 2, 5, '₹24 - ₹42 LPA', 'FULL_TIME', 'ON_SITE', 'Java, Spring Boot, Angular, TypeScript, System Design, DSA, Redis', 'Own merchant onboarding, live menu inventory management, and hyper-local dining reservations for millions of monthly active users.', 'https://www.zomato.com/careers'),
(10, 'Associate / Senior Associate - Java', 'Morgan Stanley', 'https://upload.wikimedia.org/wikipedia/commons/3/34/Morgan_Stanley_Logo_1.svg', 'Mumbai / Bengaluru', 3, 6, '₹22 - ₹35 LPA', 'FULL_TIME', 'HYBRID', 'Java, Spring Boot, Multithreading, DSA, Low Latency, Oracle SQL', 'Institutional Securities Technology division. Responsible for algorithmic order execution, algorithmic risk engines, and post-trade processing platforms.', 'https://www.morganstanley.com/careers'),
(11, 'Full Stack Software Engineer', 'Accenture', 'https://upload.wikimedia.org/wikipedia/commons/c/cd/Accenture.svg', 'Bengaluru / Pune / Chennai', 1, 4, '₹7 - ₹14 LPA', 'FULL_TIME', 'HYBRID', 'Java, Spring Boot, Angular, JavaScript, Docker, Microservices', 'Design and deliver customer-facing web applications and event-driven backend microservices for global life sciences and telecom accounts.', 'https://www.accenture.com/in-en/careers'),
(12, 'Software Engineer (Algorithms & Core Systems)', 'Google', 'https://upload.wikimedia.org/wikipedia/commons/2/2f/Google_2015_logo.svg', 'Bengaluru / Hyderabad', 2, 6, '₹38 - ₹60 LPA', 'FULL_TIME', 'HYBRID', 'Java, C++, DSA, System Design, Distributed Systems, Linux', 'Work on Google Search infrastructure, Ads bidding pipelines, or Google Cloud platform services. Deep expertise in data structures, algorithms, and asymptotic complexity required.', 'https://careers.google.com');

SELECT setval('job_openings_id_seq', (SELECT MAX(id) FROM job_openings));
