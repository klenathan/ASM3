# Cloud Computing — Assessment 3

**Source:** `ASSESSMENT_3_S2-1.pdf` (RMIT Classification: Trusted)  
**Assessment type:** Individual assignment  
**Submission:** Online through Canvas → Assignments → Assessment 3  
**Due date stated in the brief:** 23:59 on 12 September 2026  
**Weighting stated in the brief:** 40 marks / 40% of the final grade

> Canvas announcements, the relevant discussion forums, and the Canvas Assessment 3 page may clarify or update this brief. Treat the latest Canvas instructions as authoritative.

## 1. Purpose and scope

Assessment 3 requires an end-to-end cloud application implemented on the AWS cloud platform and supported by a solution architecture document and an assessed demonstration. Students may choose any programming language, framework, and third-party APIs.

The assessment evaluates:

1. Design and development of a highly scalable application using distributed-architecture knowledge and multiple cloud services.
2. An end-to-end solution architecture document for the application.
3. A product demonstration.

The sample solution architecture documents supplied in Canvas are references for depth and project ideas. They may have been produced against earlier specifications. This assessment does **not** require a developer manual or user manual.

Before implementation, discuss the proposal with the tutor. The brief recommends finalising the preliminary idea by Week 5 or Week 6 so implementation can begin early.

## 2. Example ideas

The brief gives these examples:

- Contact-tracing tool for health authorities and governments.
- Lightweight ride-sharing system where passengers book rides and drivers accept bookings.
- Lightweight social-media platform where users share content within their social network.
- Lightweight cryptocurrency exchange where users maintain portfolios, trade assets, and monitor trends.

The expanded contact-tracing example lists possible use cases:

- **Trace:** Find when a user was near another app user who later tested positive.
- **Alert:** Show coronavirus risk for a postcode district.
- **Check-in:** Scan a venue QR code and receive contact alerts without filling in a form.
- **Symptoms:** Assess symptoms and advise whether testing may be needed.
- **Test:** Help a user order a test when needed.
- **Isolate:** Track an isolation countdown and provide relevant advice.

Possible AWS services shown with that example are RDS, Elastic Beanstalk, API Gateway, Lambda, CloudFront, S3, IAM, and SES. IAM and SES are marked in the brief as services for which no marks are offered in that example.

## 3. Recommended schedule

| Period | Milestone | Recommended activities and references |
| --- | --- | --- |
| Week 4 | AWS service investigation | Investigate AWS services using lecture slides and AWS documentation. |
| Week 5 | Preliminary project idea consultation | Consult during online student consultation sessions. Use lecture slides, AWS documentation, tutorial notes, and prior sample solution architecture documents. |
| Week 6 | System architecture consultation | Consult during online student consultation sessions. Design the project and system architecture. |
| Weeks 7–12 | Project implementation consultation | Implement and test the project, and write the solution architecture document using AWS documentation, tutorial notes, and prior samples. |
| Week 12 | Implementation, document, and code submission | Wrap up the implementation and solution architecture document, then submit. |
| Week 13 | Project demo | Demonstrate the project. |

The submission section separately states that demonstrations must be completed by Week 12 and that the booking becomes available in Week 12. Resolve any timetable discrepancy through the current Canvas instructions and tutor.

## 4. Required AWS categories and automation

The application must use AWS services under all of these categories through the AWS Management Console:

- Compute
- Containers
- Storage
- Networking and Content Delivery
- Database
- Analytics

For full credit, every selected service/API must satisfy **both** conditions:

1. It is fully implemented and automated in the application.
2. The examiner considers it an appropriate selection for the application.

“Fully implemented and automated” means that the client interface, application code, or another service automatically invokes the service/API. A service/API invoked only manually through the AWS CLI or AWS Console does not meet this requirement.

### Service mark values in the brief

| Service type | Marks per fully implemented service type |
| --- | ---: |
| Elastic Beanstalk | 6 |
| Lambda | 6 |
| API Gateway | 6 |
| ECS | 6 |
| EMR | 6 |
| Other fully implemented AWS service types in the required categories | 3 |
| Fully implemented and automated third-party API type | 2 |

The service marks are not iterative or additive for services automatically bundled inside another service. For example, if an Elastic Beanstalk, ECS, EMR, or Lambda implementation automatically contains or uses EC2 and S3, that does not produce separate repeated marks for EC2 and S3; the brief says only the 6 marks for the higher-value service are counted in that case.

Students are encouraged to use third-party APIs. The brief gives Twitter Sign-in and Facebook Feed as examples. Although there is no stated limit on how many third-party APIs may be integrated, the rubric says that only two are graded.

## 5. Client interface and deployment

The application must have a well-designed, user-friendly client-side interface, such as a website or mobile app. If the project includes data analysis, results should be interpreted clearly using tables and/or graphical formats.

The application must be deployed in AWS Cloud.

## 6. Project options

Choose one of the following:

1. Develop an original cloud application based on the student's own idea and strengths. The brief explicitly prohibits reusing the Assessment 2 application.
2. Develop an application idea suggested by the tutor, based on the student's interests and strengths.

## 7. Solution architecture document

A solution architecture document is mandatory. Submit it as a Word or PDF document inside the submission ZIP. The brief permits a student-created format or the supplied structure.

The document must include the following.

### 7.1 Links

Provide:

- Live URL of the project.
- Repository URL for source code, if applicable (GitHub, Bitbucket, Google Drive, Dropbox, or another repository location).
- Public dataset links, if applicable.

Do not store AWS credentials in the source-code repository or submission.

### 7.2 Summary

Give a short description of the project's objective and purpose.

### 7.3 Introduction

Cover:

- **Motivation:** Key reasons for building the project.
- **High-level view:** What the project does from a birds-eye perspective.
- **Beneficiaries:** Target users, organisations, or other audiences.

### 7.4 Related work

Discuss related applications or other work similar to the project.

### 7.5 System architecture

Include one or more comprehensively documented architectural diagrams. The diagram(s) must show:

1. The complete process by which each client-interface operation invokes other system components.
2. Detailed interactions, including invocations, among all components.
3. The function of every component.

Also include:

- A system description explaining why each component is used.
- Descriptions of datasets, data structures, and APIs used by the project, if any. Use figures where helpful.

### 7.6 References

List important references and website links used to develop the application.

## 8. ZIP submission layout

The submission ZIP must contain:

```text
submission.zip
├── solution-architecture-document.(docx|pdf)
├── doc_images/
├── code/
├── deploy/
└── data/
```

Requirements for each path:

- `doc_images/`: All images used in the solution architecture document.
- `code/`: All project source code. If the source is larger than 5 MB, provide a download/share link in `code.txt` instead. Do not include security credentials.
- `deploy/`: Runnable or deployable files, if any, such as `.war`, `.zip`, or `.jar` files.
- `data/`: Data files and SQL scripts, if any. If data is larger than 5 MB, provide a download link in `data.txt`.

## 9. Demonstration

Demonstrate the live application to the tutor. The brief describes each demonstration as approximately 30 minutes, including:

- Project introduction.
- Application demonstration.
- Questions and answers.
- Walk-through of the solution architecture document.

Keep the application live and all demonstration materials ready. The brief warns of a penalty for failing to complete the demonstration by Week 12.

## 10. Referencing and academic integrity

All submitted content must be the student's own work. Acknowledge and reference material from sources outside the content directly provided under Canvas → Modules using IEEE referencing style.

For sourced work:

- Add a code comment near the referenced code, data, diagram, model, framework, or idea.
- Include the detailed IEEE reference before the relevant code in a code comment where applicable.
- Include the corresponding publication details in the document's reference list so readers can locate the source.
- Internet sources must also be referenced.

The brief recommends the CiteThisForMe tool for students unfamiliar with IEEE style.

Unacknowledged copied, summarised, paraphrased, or discussed material may be treated as plagiarism. The warning specifically includes failure to document a source, use of copyright material from the internet or databases, and collusion. RMIT treats plagiarism as serious misconduct. Electronic submission also constitutes agreement to the assessment declaration.

## 11. Late submission

The brief contains two late-submission statements:

- The opening assessment notice states a standard penalty of 10% per working day, for up to five working days late, unless special consideration has been granted.
- The submission section states a 10% penalty of the total mark per working day and says no marks are awarded without the project materials and solution architecture document.

Use the latest Canvas Assessment 3 instructions and tutor clarification if these statements are applied differently.

## 12. Rubric

The PDF rubric contains these criteria and maximum values:

| Criterion | Excellent / full-credit description | Partial / lower-credit guidance | Maximum shown |
| --- | --- | --- | ---: |
| Project idea and project formulation with appropriate technology selection | Project idea excellently formulated and technologies appropriately selected. | Idea is partially formulated, or most technology selections are appropriate only to a limited extent. | 2 |
| Skill development in new tools and technologies | Excellent knowledge demonstrated in learning new tools and technologies needed to complete the project. | Good knowledge with minor issues, or poor knowledge with major issues. | 3 |
| Appropriate utilisation and full implementation of cloud tools, technologies, and services | Appropriate utilisation and full implementation according to the AWS and API requirements in Section 4. | The PDF presents this as a 35-to-0-point criterion. | 35 |
| Solution architecture document | Summary, introduction, related work, system architecture, system descriptions, dataset/data structure/API descriptions, and references are present and detailed. | Sections may receive partial credit when written with some detail, poorly written, or missing. | 10 |

The document criterion is broken down in the PDF as:

- Summary — 0.5 points
- Introduction — 1 point
- Related work — 1 point
- System architecture — 5 points
- System descriptions — 1 point
- Datasets/data structures/APIs — 1 point
- References — 0.5 points

For each solution-architecture-document part, the rubric describes these quality levels:

- **100%:** Well written, substantial detail, and rich visualisations where required.
- **67%:** Written with some detail and visualisations where required.
- **33%:** Poorly written.
- **0%:** Missing.

### Marking inconsistency to preserve

The brief heading says the assessment is worth 40 marks and contributes 40%, while the rubric's displayed maximums total 50 points (`2 + 3 + 35 + 10`). This markdown preserves both statements rather than inventing a conversion. Confirm the effective weighting and rubric with Canvas or the tutor before relying on a total.

## 13. Agent implementation checklist

When changing this project for Assessment 3, verify the complete path rather than only provisioning infrastructure:

- The application visibly uses each selected AWS service/API through a client operation, application code path, or automated service-to-service invocation.
- The selected service/API is appropriate for the product and its role is explainable in the architecture document.
- All six required AWS service categories are represented: Compute, Containers, Storage, Networking and Content Delivery, Database, and Analytics.
- The live client interface can exercise the assessed workflows.
- Data analysis, where present, is rendered in an interpretable table or graph.
- The deployment is live in AWS and the live URL is recorded.
- The architecture diagram traces every client operation through the components it invokes and states each component's function.
- Source, deployable artifacts, data/SQL scripts, document images, and external links follow the ZIP layout.
- Credentials and other secrets are excluded.
- External sources are acknowledged in code comments and IEEE references.
- Demo flows and the architecture document are ready for the approximately 30-minute demonstration.
