-- SOFE 3700U Phase II: Internship Application and Recruitment Management System
-- PostgreSQL 18
-- Run once on an empty project database. The Part B inserts use the initial identity values.
-- Do not rerun the full file on a database that already contains this data.

-- PART A: RELATIONAL SCHEMA

CREATE TABLE app_user (
    user_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    user_role VARCHAR(20) NOT NULL CHECK (user_role IN ('ADMIN', 'STUDENT', 'RECRUITER')),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE student (
    student_id INTEGER PRIMARY KEY REFERENCES app_user(user_id) ON DELETE CASCADE,
    first_name VARCHAR(60) NOT NULL,
    last_name VARCHAR(60) NOT NULL,
    program VARCHAR(120) NOT NULL,
    expected_grad_year INTEGER NOT NULL CHECK (expected_grad_year BETWEEN 2026 AND 2035)
);

CREATE TABLE employer (
    employer_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    company_name VARCHAR(150) NOT NULL,
    industry VARCHAR(100),
    website VARCHAR(255)
);

CREATE TABLE recruiter (
    recruiter_id INTEGER PRIMARY KEY REFERENCES app_user(user_id) ON DELETE CASCADE,
    employer_id INTEGER NOT NULL REFERENCES employer(employer_id) ON DELETE RESTRICT,
    first_name VARCHAR(60) NOT NULL,
    last_name VARCHAR(60) NOT NULL,
    job_title VARCHAR(100),
    UNIQUE (recruiter_id, employer_id)
);

CREATE TABLE application_status (
    status_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    status_name VARCHAR(40) NOT NULL UNIQUE
);

CREATE TABLE internship_posting (
    posting_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    employer_id INTEGER NOT NULL,
    recruiter_id INTEGER NOT NULL,
    title VARCHAR(150) NOT NULL,
    description TEXT NOT NULL,
    location VARCHAR(120) NOT NULL,
    work_mode VARCHAR(20) NOT NULL CHECK (work_mode IN ('On-site', 'Hybrid', 'Remote')),
    min_salary NUMERIC(10, 2),
    max_salary NUMERIC(10, 2),
    deadline DATE NOT NULL,
    posted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    source VARCHAR(80) NOT NULL DEFAULT 'Manual',
    external_url VARCHAR(500),
    posting_status VARCHAR(20) NOT NULL DEFAULT 'Open'
        CHECK (posting_status IN ('Open', 'Closed', 'Draft')),
    CHECK (min_salary IS NULL OR max_salary IS NULL OR min_salary <= max_salary),
    FOREIGN KEY (recruiter_id, employer_id)
        REFERENCES recruiter(recruiter_id, employer_id) ON DELETE RESTRICT
);

CREATE TABLE application (
    application_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES student(student_id) ON DELETE CASCADE,
    posting_id INTEGER NOT NULL REFERENCES internship_posting(posting_id) ON DELETE CASCADE,
    status_id INTEGER NOT NULL REFERENCES application_status(status_id) ON DELETE RESTRICT,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resume_link VARCHAR(500),
    UNIQUE (student_id, posting_id)
);

CREATE TABLE application_status_history (
    history_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    application_id INTEGER NOT NULL REFERENCES application(application_id) ON DELETE CASCADE,
    status_id INTEGER NOT NULL REFERENCES application_status(status_id) ON DELETE RESTRICT,
    changed_by_user_id INTEGER REFERENCES app_user(user_id) ON DELETE SET NULL,
    changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    note VARCHAR(500)
);

CREATE TABLE interview (
    interview_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    application_id INTEGER NOT NULL REFERENCES application(application_id) ON DELETE CASCADE,
    recruiter_id INTEGER NOT NULL REFERENCES recruiter(recruiter_id) ON DELETE RESTRICT,
    scheduled_at TIMESTAMP NOT NULL,
    interview_mode VARCHAR(20) NOT NULL CHECK (interview_mode IN ('Online', 'In-person', 'Phone')),
    outcome VARCHAR(30) NOT NULL DEFAULT 'Pending'
        CHECK (outcome IN ('Pending', 'Passed', 'Not selected', 'Cancelled')),
    meeting_details VARCHAR(500)
);

-- PART B: SAMPLE DATA
-- All names, email addresses, links, and password-hash strings below are fictional test data.

INSERT INTO app_user (email, password_hash, user_role) VALUES
('student1@example.com', 'demo_hash_student_01', 'STUDENT'),
('student2@example.com', 'demo_hash_student_02', 'STUDENT'),
('student3@example.com', 'demo_hash_student_03', 'STUDENT'),
('student4@example.com', 'demo_hash_student_04', 'STUDENT'),
('student5@example.com', 'demo_hash_student_05', 'STUDENT'),
('student6@example.com', 'demo_hash_student_06', 'STUDENT'),
('recruiter1@example.com', 'demo_hash_recruiter_01', 'RECRUITER'),
('recruiter2@example.com', 'demo_hash_recruiter_02', 'RECRUITER'),
('recruiter3@example.com', 'demo_hash_recruiter_03', 'RECRUITER'),
('recruiter4@example.com', 'demo_hash_recruiter_04', 'RECRUITER'),
('recruiter5@example.com', 'demo_hash_recruiter_05', 'RECRUITER'),
('recruiter6@example.com', 'demo_hash_recruiter_06', 'RECRUITER');

INSERT INTO student (student_id, first_name, last_name, program, expected_grad_year) VALUES
(1, 'Ava', 'Chen', 'Software Engineering', 2027),
(2, 'Noah', 'Patel', 'Computer Science', 2028),
(3, 'Maya', 'Singh', 'Software Engineering', 2027),
(4, 'Ethan', 'Brooks', 'Information Technology', 2029),
(5, 'Zara', 'Okafor', 'Computer Science', 2028),
(6, 'Leo', 'Martin', 'Software Engineering', 2027);

INSERT INTO employer (company_name, industry, website) VALUES
('Northstar Analytics', 'Technology', 'https://northstar.example.com'),
('Maple Robotics', 'Robotics', 'https://maplerobotics.example.com'),
('Harbour Health Tech', 'Healthcare', 'https://harbourhealth.example.com'),
('Summit Financial', 'Finance', 'https://summitfinancial.example.com'),
('GreenGrid Energy', 'Energy', 'https://greengrid.example.com'),
('PixelWorks Studio', 'Media', 'https://pixelworks.example.com');

INSERT INTO recruiter (recruiter_id, employer_id, first_name, last_name, job_title) VALUES
(7, 1, 'Olivia', 'Reed', 'Campus Recruiter'),
(8, 2, 'Liam', 'Wong', 'Talent Specialist'),
(9, 3, 'Sophia', 'Ali', 'Recruitment Coordinator'),
(10, 4, 'Lucas', 'Kim', 'Hiring Manager'),
(11, 5, 'Amara', 'Lewis', 'University Recruiter'),
(12, 6, 'Daniel', 'Scott', 'People Operations');

INSERT INTO application_status (status_name) VALUES
('Submitted'), ('Under Review'), ('Interview Scheduled'),
('Offer'), ('Rejected'), ('Withdrawn');

INSERT INTO internship_posting
(employer_id, recruiter_id, title, description, location, work_mode,
 min_salary, max_salary, deadline, source, external_url, posting_status) VALUES
(1, 7, 'Data Analyst Intern', 'Analyze datasets and prepare reports.', 'Toronto, ON', 'Hybrid',
 22.00, 28.00, '2027-01-15', 'Company site', 'https://northstar.example.com/jobs/1', 'Open'),
(2, 8, 'Software Developer Intern', 'Help build and test robotics software.', 'Oshawa, ON', 'On-site',
 24.00, 32.00, '2027-01-20', 'Company site', 'https://maplerobotics.example.com/jobs/2', 'Open'),
(3, 9, 'QA Intern', 'Create and run software test cases.', 'Toronto, ON', 'Hybrid',
 21.00, 27.00, '2027-02-01', 'Job board', 'https://harbourhealth.example.com/jobs/3', 'Open'),
(4, 10, 'Backend Developer Intern', 'Support API and database development.', 'Remote', 'Remote',
 25.00, 34.00, '2027-02-10', 'Company site', 'https://summitfinancial.example.com/jobs/4', 'Open'),
(5, 11, 'Energy Systems Intern', 'Assist with energy data analysis.', 'Whitby, ON', 'On-site',
 23.00, 30.00, '2027-02-15', 'Job board', 'https://greengrid.example.com/jobs/5', 'Open'),
(6, 12, 'Web Design Intern', 'Help develop and maintain web applications.', 'Toronto, ON', 'Hybrid',
 20.00, 26.00, '2027-02-20', 'Company site', 'https://pixelworks.example.com/jobs/6', 'Open');

INSERT INTO application (student_id, posting_id, status_id, resume_link) VALUES
(1, 1, 3, 'https://files.example.com/resume1.pdf'),
(2, 2, 2, 'https://files.example.com/resume2.pdf'),
(3, 3, 3, 'https://files.example.com/resume3.pdf'),
(4, 4, 4, 'https://files.example.com/resume4.pdf'),
(5, 5, 5, 'https://files.example.com/resume5.pdf'),
(6, 6, 2, 'https://files.example.com/resume6.pdf');

INSERT INTO application_status_history
(application_id, status_id, changed_by_user_id, note) VALUES
(1, 3, 7, 'Interview scheduled with the recruiter.'),
(2, 2, 8, 'Application is being reviewed.'),
(3, 3, 9, 'Interview invitation sent.'),
(4, 4, 10, 'Offer made to the student.'),
(5, 5, 11, 'Application was not selected.'),
(6, 2, 12, 'Recruiter is reviewing the application.');

INSERT INTO interview
(application_id, recruiter_id, scheduled_at, interview_mode, outcome, meeting_details) VALUES
(1, 7, '2027-01-12 10:00:00', 'Online', 'Pending', 'Video interview'),
(2, 8, '2027-01-14 13:30:00', 'Phone', 'Pending', 'Recruiter phone screen'),
(3, 9, '2027-01-18 11:00:00', 'Online', 'Pending', 'Technical interview'),
(4, 10, '2027-01-19 14:00:00', 'In-person', 'Passed', 'Final interview'),
(5, 11, '2027-01-21 09:30:00', 'Online', 'Cancelled', 'Interview cancelled'),
(6, 12, '2027-01-25 15:00:00', 'Phone', 'Pending', 'Initial phone screen');

-- PART C: TEN VIEWS
-- View 1 (common): join of five relations for an application dashboard.
CREATE OR REPLACE VIEW v_application_details AS
SELECT a.application_id, s.student_id, s.first_name, s.last_name,
       p.title AS internship_title, e.company_name, st.status_name, a.applied_at
FROM application a
JOIN student s ON s.student_id = a.student_id
JOIN internship_posting p ON p.posting_id = a.posting_id
JOIN employer e ON e.employer_id = p.employer_id
JOIN application_status st ON st.status_id = a.status_id;

-- View 2 (common): grouped status totals; ALL compares each total to all grouped totals.
CREATE OR REPLACE VIEW v_application_status_summary AS
SELECT st.status_name, COUNT(a.application_id) AS application_count
FROM application_status st
LEFT JOIN application a ON a.status_id = st.status_id
GROUP BY st.status_id, st.status_name
HAVING COUNT(a.application_id) >= ALL (
    SELECT COUNT(a2.application_id)
    FROM application_status st2
    LEFT JOIN application a2 ON a2.status_id = st2.status_id
    GROUP BY st2.status_id
);

-- View 3 (common): correlated query selects the most recent history entry per application.
CREATE OR REPLACE VIEW v_application_status_history_audit AS
SELECT h.history_id, h.application_id,
       s.first_name || ' ' || s.last_name AS student_name,
       st.status_name, h.changed_at, u.email AS changed_by_email, h.note
FROM application_status_history h
JOIN application a ON a.application_id = h.application_id
JOIN student s ON s.student_id = a.student_id
JOIN application_status st ON st.status_id = h.status_id
LEFT JOIN app_user u ON u.user_id = h.changed_by_user_id
WHERE h.changed_at = (
    SELECT MAX(h2.changed_at)
    FROM application_status_history h2
    WHERE h2.application_id = h.application_id
);

-- View 4 (common): FULL OUTER JOIN combines employer posting and application totals.
CREATE OR REPLACE VIEW v_employer_activity_full_summary AS
WITH posting_counts AS (
    SELECT employer_id, COUNT(*) AS posting_count
    FROM internship_posting
    GROUP BY employer_id
),
application_counts AS (
    SELECT p.employer_id, COUNT(a.application_id) AS application_count
    FROM internship_posting p
    JOIN application a ON a.posting_id = p.posting_id
    GROUP BY p.employer_id
)
SELECT e.employer_id, e.company_name,
       COALESCE(pc.posting_count, 0) AS posting_count,
       COALESCE(ac.application_count, 0) AS application_count
FROM posting_counts pc
FULL OUTER JOIN application_counts ac ON ac.employer_id = pc.employer_id
JOIN employer e ON e.employer_id = COALESCE(pc.employer_id, ac.employer_id);

-- View 5 (common): nested query uses UNION to include postings with or without applications.
CREATE OR REPLACE VIEW v_posting_application_counts AS
SELECT p.posting_id, p.title, e.company_name,
       (SELECT COUNT(*) FROM application a WHERE a.posting_id = p.posting_id) AS application_count
FROM internship_posting p
JOIN employer e ON e.employer_id = p.employer_id
WHERE p.posting_id IN (
    SELECT a1.posting_id FROM application a1
    UNION
    SELECT p2.posting_id
    FROM internship_posting p2
    WHERE NOT EXISTS (
        SELECT 1 FROM application a2 WHERE a2.posting_id = p2.posting_id
    )
);

-- View 6 (custom): open internship postings with company and recruiter information.
CREATE OR REPLACE VIEW v_open_internship_postings AS
SELECT p.posting_id, p.title, e.company_name, p.location, p.work_mode,
       p.min_salary, p.max_salary, p.deadline, u.email AS recruiter_email
FROM internship_posting p
JOIN employer e ON e.employer_id = p.employer_id
JOIN recruiter r ON r.recruiter_id = p.recruiter_id
JOIN app_user u ON u.user_id = r.recruiter_id
WHERE p.posting_status = 'Open';

-- View 7 (custom): upcoming interviews with student, position, recruiter, and outcome.
CREATE OR REPLACE VIEW v_interview_schedule AS
SELECT i.interview_id, i.scheduled_at, i.interview_mode, i.outcome,
       s.first_name || ' ' || s.last_name AS student_name,
       p.title AS internship_title, e.company_name,
       ru.first_name || ' ' || ru.last_name AS recruiter_name
FROM interview i
JOIN application a ON a.application_id = i.application_id
JOIN student s ON s.student_id = a.student_id
JOIN internship_posting p ON p.posting_id = a.posting_id
JOIN employer e ON e.employer_id = p.employer_id
JOIN recruiter ru ON ru.recruiter_id = i.recruiter_id;

-- View 8 (custom): posting totals assigned to each recruiter.
CREATE OR REPLACE VIEW v_recruiter_posting_workload AS
SELECT r.recruiter_id, r.first_name || ' ' || r.last_name AS recruiter_name,
       e.company_name, COUNT(p.posting_id) AS posting_count
FROM recruiter r
JOIN employer e ON e.employer_id = r.employer_id
LEFT JOIN internship_posting p ON p.recruiter_id = r.recruiter_id
GROUP BY r.recruiter_id, r.first_name, r.last_name, e.company_name;

-- View 9 (custom): salary range summary by employer.
CREATE OR REPLACE VIEW v_employer_salary_summary AS
SELECT e.employer_id, e.company_name, COUNT(p.posting_id) AS posting_count,
       MIN(p.min_salary) AS lowest_minimum_salary,
       MAX(p.max_salary) AS highest_maximum_salary,
       ROUND(AVG((p.min_salary + p.max_salary) / 2.0), 2) AS average_midpoint_salary
FROM employer e
LEFT JOIN internship_posting p ON p.employer_id = e.employer_id
GROUP BY e.employer_id, e.company_name;

-- View 10 (custom): application totals for every student, including students with none.
CREATE OR REPLACE VIEW v_student_application_counts AS
SELECT s.student_id, s.first_name, s.last_name,
       COUNT(a.application_id) AS application_count
FROM student s
LEFT JOIN application a ON a.student_id = s.student_id
GROUP BY s.student_id, s.first_name, s.last_name;
