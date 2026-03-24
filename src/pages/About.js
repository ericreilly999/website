import React from 'react';

function About() {
  return (
    <main className="main">
      <section className="about">
        <div className="container">
          <h2>About</h2>
          <p>
            I'm a Philadelphia-born IT professional with over six years of experience building
            reliable, scalable platforms. I lead SRE teams, drive observability strategy, and
            design durable cloud architectures, with a growing focus on practical AI adoption. I
            currently work as a Senior Cloud Architect at Togetherwork, where I strengthen SRE
            practices across the organization. I earned my B.S. in Information Technology
            Management from Bloomsburg University in 2019 and relocated to Tampa in 2021, where
            I'm now based.
          </p>
          <p>
            Outside of work, my interests include football (go birds), chess, running, travel,
            food, history, cats, and video games.
          </p>
          <p>
            I'm also open to part-time consulting opportunities that do not conflict with my
            full-time role. Please reach out via the 'contact' form.
          </p>
        </div>
      </section>

      <section className="experience">
        <div className="container">
          <h2>Experience</h2>

          <div className="job">
            <h3>Senior Cloud Architect</h3>
            <p className="company">Togetherwork | November 2025–Present</p>
            <ul>
              <li>Drive observability strategy and implementation</li>
              <li>Spearhead SRE-focused deliverables including disaster recovery planning</li>
              <li>Lead toil reduction initiatives and architecture reviews</li>
              <li>Design scalable cloud solutions and reliability frameworks</li>
            </ul>
          </div>

          <div className="job">
            <h3>Senior SRE Manager</h3>
            <p className="company">FIS Global | Jan 2021–November 2025</p>
            <ul>
              <li>Ran a global team of 20 SREs supporting FIS's core banking SaaS platform</li>
              <li>Defined SLOs to meet customer and regulatory requirements</li>
              <li>Drove cloud migrations, performance testing, and automation</li>
              <li>Mentored engineers and promoted operational excellence</li>
            </ul>
          </div>

          <div className="job">
            <h3>Programmer Analyst</h3>
            <p className="company">FIS Global | Jun 2019–Dec 2020</p>
            <ul>
              <li>Managed 15+ concurrent support cases involving defects and performance</li>
              <li>Partnered with engineering teams to resolve issues and improve satisfaction</li>
              <li>Wrote bash/python scripts to automate repetitive tasks</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="achievements">
        <div className="container">
          <h2>Key Wins</h2>
          <ul>
            <li>
              Built CI/CD workflows that eliminated 1,000+ hours of manual work and cut client
              credits by 77%
            </li>
            <li>
              Reduced SLA-impacting incidents by 53% through better observability and incident
              management
            </li>
            <li>Scaled platform from zero to 3M+ active accounts across 10 major fintech partners</li>
            <li>Led successful Kubernetes and Azure migrations for enhanced scalability</li>
            <li>Managed four major client data conversions with minimal disruption</li>
          </ul>
        </div>
      </section>

      <section className="skills">
        <div className="container">
          <h2>Tech Stack</h2>
          <div className="skills-grid">
            <div className="skill-category">
              <h4>Cloud &amp; Infrastructure</h4>
              <p>Kubernetes, Azure, Terraform, Docker, Jenkins</p>
            </div>
            <div className="skill-category">
              <h4>Languages &amp; Tools</h4>
              <p>Python, Bash, PowerShell, SQL, Java, Git</p>
            </div>
            <div className="skill-category">
              <h4>Monitoring &amp; Ops</h4>
              <p>Splunk, Dynatrace, Grafana, Prometheus, Azure Monitor</p>
            </div>
            <div className="skill-category">
              <h4>Leadership</h4>
              <p>SRE, DevOps, Incident Management, Strategic Planning</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

export default About;
