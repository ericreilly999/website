import React from 'react';

const majorContributions = [
  'Platform owner for an international core banking SaaS offering on Microsoft Azure.',
  'Selected for the EZRA executive coaching program for high-potential leaders.',
  'Led reliability engineering for a core banking SaaS platform that grew from 0 to 5M+ accounts over five years.',
  'Spearheaded AI adoption with a custom incident-response GPT, a Claude-based change review workflow, and team enablement around MCPs.',
  'Drove five data migrations and three application migrations from VMs to containers to improve scalability and cloud efficiency.',
  'Built AI-driven workflows that removed 1,000+ hours of manual work and reduced client credits by 77%.',
  'Reduced SLA-impacting incidents by 53% through stronger observability, SLO discipline, and system design standardization.',
  'Standardized observability across 20+ Datadog tenants, saving about $10K per month and eliminating roughly 700 legacy monitors.',
];

const experience = [
  {
    title: 'Senior Cloud Architect',
    company: 'Togetherwork | Nov 2025 - Present',
    bullets: [
      'Lead observability and reliability strategy across a 25+ product SaaS portfolio.',
      'Drive platform-wide SRE initiatives including disaster recovery, performance testing, and toil reduction.',
      'Partner with engineering and product teams to modernize infrastructure with AI-assisted development and AWS-native automation.',
    ],
  },
  {
    title: 'Senior SRE Manager',
    company: 'FIS Global | Jan 2021 - Nov 2025',
    bullets: [
      'Led a global team of about 15 SREs supporting a large-scale core banking SaaS platform with strict uptime and regulatory requirements.',
      'Owned production reliability, incident management, and SLO enforcement across customer-facing environments.',
      'Drove cross-functional cloud migrations, data conversions, and platform modernization efforts.',
      'Scaled operational practices and team capability to support rapid platform growth.',
    ],
  },
  {
    title: 'Programmer Analyst',
    company: 'FIS Global | Jun 2019 - Dec 2020',
    bullets: [
      'Managed concurrent production support cases spanning performance issues, defects, and configuration challenges.',
      'Partnered with engineering teams to diagnose root causes and improve platform stability.',
      'Built Bash and Python automation to streamline support workflows and reduce manual effort.',
    ],
  },
];

const skillAreas = [
  {
    heading: 'AI and Automation',
    details: 'Claude, ChatGPT, Codex, MCP-enabled workflows, AI-assisted change review, incident-response automation',
  },
  {
    heading: 'Cloud and Platform',
    details: 'AWS, Azure, Kubernetes, Terraform, ECS, Docker, CI/CD, cloud architecture',
  },
  {
    heading: 'Observability and Reliability',
    details: 'Datadog, Dynatrace, observability strategy, SLOs, incident management, disaster recovery, performance testing',
  },
  {
    heading: 'Delivery and Leadership',
    details: 'SRE leadership, platform modernization, toil reduction, engineering enablement, operational coaching',
  },
];

function About() {
  return (
    <main className="main">
      <section className="about">
        <div className="container">
          <h2>Professional Summary</h2>
          <p className="summary-lead">
            Senior Cloud Architect and SRE leader with 7+ years of experience driving
            reliability, scalability, AI adoption, and cloud transformation across SaaS
            platforms.
          </p>
          <p>
            I currently work at Togetherwork, where I help standardize reliability and
            observability practices across a broad SaaS portfolio. My work has focused on
            reducing incidents, modernizing platforms, improving cloud efficiency, and turning AI
            into something engineering teams can actually use day to day.
          </p>
          <p>
            I earned my B.S. in Information Technology Management from Bloomsburg University and
            am based in Tampa, Florida. Outside of work, I am into football, chess, running,
            travel, food, history, cats, and video games.
          </p>
          <p>
            I am also open to selective consulting opportunities that do not conflict with my
            full-time role. The contact page is the best place to reach me.
          </p>
        </div>
      </section>

      <section className="achievements">
        <div className="container">
          <h2>Major Contributions</h2>
          <ul className="highlights-list">
            {majorContributions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="experience">
        <div className="container">
          <h2>Experience</h2>
          {experience.map((role) => (
            <div className="job" key={role.title}>
              <h3>{role.title}</h3>
              <p className="company">{role.company}</p>
              <ul>
                {role.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="skills">
        <div className="container">
          <h2>Technical Skills</h2>
          <div className="skills-grid">
            {skillAreas.map((area) => (
              <div className="skill-category" key={area.heading}>
                <h4>{area.heading}</h4>
                <p>{area.details}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

export default About;
