-- Migration V21: Update job opening external URLs with deep, targeted requisition and role search links.
-- Ensures clicking "Official Opening Page" lands candidates directly on the specific opening / requisition search
-- instead of generic corporate homepages.

UPDATE job_openings
SET external_apply_url = 'https://www.amazon.jobs/en/search?base_query=Software+Development+Engineer+Java+Spring&loc_query=India'
WHERE id = 1;

UPDATE job_openings
SET external_apply_url = 'https://careers.swiggy.com/#/careers?query=Backend'
WHERE id = 2;

UPDATE job_openings
SET external_apply_url = 'https://careers.jpmorgan.com/global/en/search-results?keywords=Full%20Stack%20Developer%20Java%20Angular'
WHERE id = 3;

UPDATE job_openings
SET external_apply_url = 'https://www.phonepe.com/careers/job-openings/?search=Software+Engineer'
WHERE id = 4;

UPDATE job_openings
SET external_apply_url = 'https://careers.oracle.com/jobs/#en/sites/jobsearch/requisitions?keyword=Angular'
WHERE id = 5;

UPDATE job_openings
SET external_apply_url = 'https://razorpay.com/jobs/#openings'
WHERE id = 6;

UPDATE job_openings
SET external_apply_url = 'https://ibegin.tcs.com/iBegin/jobs/search'
WHERE id = 7;

UPDATE job_openings
SET external_apply_url = 'https://jobs.careers.microsoft.com/global/en/search?q=Software+Engineer+Distributed+Systems&lc=India'
WHERE id = 8;

UPDATE job_openings
SET external_apply_url = 'https://www.zomato.com/careers'
WHERE id = 9;

UPDATE job_openings
SET external_apply_url = 'https://www.morganstanley.com/careers/career-opportunities-search?keyword=Java'
WHERE id = 10;

UPDATE job_openings
SET external_apply_url = 'https://www.accenture.com/in-en/careers/jobsearch?jk=Full%20Stack%20Java%20Angular'
WHERE id = 11;

UPDATE job_openings
SET external_apply_url = 'https://www.google.com/about/careers/applications/jobs/results/?q=Software%20Engineer%20Algorithms&location=India'
WHERE id = 12;
