import React from 'react';

const projects = [
  {
    title: 'Inventory Management System',
    repo: 'inventory',
    status: 'Paused proof of concept',
    updated: 'Feb 23, 2026',
    url: 'https://github.com/ericreilly999/inventory',
    description:
      'This started as a proof-of-concept for a warehousing business. The business itself is no longer active, but I kept the repository public because it shows how I approached the architecture, deployment, and delivery pipeline for the concept.',
    highlights: [
      'Microservices-based system with a FastAPI backend, a React TypeScript frontend, and JWT-based auth.',
      'Infrastructure and deployment work is fleshed out with Terraform, AWS Fargate, RDS, ElastiCache, and GitHub Actions.',
      'The README documents working authentication, a live development environment, and a staged roadmap for inventory, locations, reporting, and audit logging.',
    ],
    why:
      'This was a proof of concept for a potential client who needed a simple inventory management system with a parent-child item structure. I liked the challenge because it let me turn a very practical business need into a real architecture exercise.',
  },
  {
    title: 'AI Assistant MVP Scaffold',
    repo: 'ai-assistant',
    status: 'Active scaffold',
    updated: 'Apr 4, 2026',
    url: 'https://github.com/ericreilly999/ai-assistant',
    description:
      'A development-ready scaffold for a personal assistant MVP. It is set up to let backend, mobile, and infrastructure work move in parallel before live provider credentials are available.',
    highlights: [
      'Includes an AWS Lambda backend scaffold, React Native and Expo mobile shell, and Terraform layouts for dev, staging, and prod.',
      'Uses mock-provider mode by default so orchestration, packaging, and contract tests can run without live third-party secrets.',
      'Captures the project in a good starting state for deeper product work rather than presenting it as a finished application.',
    ],
    why:
      'Native LLM integrations still feel rough, and MCPs exist but are not especially friendly for non-developers. I wanted to learn more about connecting AI models to real data sources while exploring a real market need and building deeper expertise in AI integrations.',
  },
  {
    title: 'Pokemon Tuxedo',
    repo: 'pokemon-tuxedo',
    status: 'Integration phase',
    updated: 'Mar 13, 2026',
    url: 'https://github.com/ericreilly999/pokemon-tuxedo',
    description:
      'A Pokemon FireRed ROM hack that focuses on dynamic level scaling, multi-region progression, and a long list of quality-of-life improvements for replayability.',
    highlights: [
      'Covers Kanto, Johto, Hoenn, and Sinnoh progression with level caps, open exploration in later regions, and more forgiving HM and evolution mechanics.',
      'Backed by 5,426+ property-based tests according to the current README.',
      'The remaining work is the integration layer: decomp integration, custom sprite assets, and regional map content.',
    ],
    why:
      'I have always loved Pokemon, especially the nostalgia around the games I played growing up. Following the Pokemon ROM hack community inspired me to try building one myself, and this project has been a fun, heavily vibe-coded way to make something outside my usual language comfort zone.',
  },
  {
    title: 'Personal Website',
    repo: 'website',
    status: 'Production live',
    updated: 'Apr 4, 2026',
    url: 'https://github.com/ericreilly999/website',
    description:
      'The site you are looking at now. It is a simple home base for who I am, what I work on, and how people can reach me, with infrastructure and deployment wired so updates are easy to ship.',
    highlights: [
      'Built as a lightweight React site with a straightforward production deployment flow.',
      'Production AWS resources are modeled in Terraform with local modules for CloudFront, S3, Route 53, ACM, and the GitHub OIDC deploy role.',
      'Tag pushes deploy to production through GitHub Actions with OIDC instead of long-lived AWS secrets.',
    ],
    why:
      'This is just a simple website to showcase what I do, highlight some of my projects, and give people a way to get in touch. Personal brand matters a lot now, and I wanted a place on the internet that felt like mine.',
  },
  {
    title: 'Prompted: Tech Talks',
    repo: 'prompted-tech-talks',
    status: 'Active — episodes live on Spotify',
    updated: 'Apr 18, 2026',
    url: 'https://github.com/ericreilly999/prompted-tech-talks',
    spotifyUrl: 'https://open.spotify.com/show/4xeSrrczxTao9JyZ8Amgmp',
    description:
      'An end-to-end AI podcast pipeline. Listeners submit a topic prompt, Claude generates a structured multi-segment script using a custom skill, OpenAI tts-1-hd synthesizes dual-voice audio (sage + echo voices with intro/outro), FFmpeg assembles the final MP3, and GitHub Actions publishes to S3, rebuilds the RSS feed, and syncs to Spotify and Apple Podcasts. Zero manual production steps after the script is approved.',
    highlights: [
      'Fully AI-native production pipeline: topic prompt in, published episode out — no manual audio editing or publishing steps.',
      'Dual-voice synthesis using OpenAI tts-1-hd with sage and echo voices; FFmpeg handles intro/outro assembly into the final MP3.',
      'GitHub Actions orchestrates S3 upload, RSS feed regeneration, and distribution sync to Spotify and Apple Podcasts on every approved script.',
    ],
    why:
      'I wanted to explore what a fully AI-native content pipeline could look like — not just using AI as a writing aid, but as the core production engine. Prompted: Tech Talks is a podcast where listeners submit tech topics as prompts, and Claude generates the full script. The result gets synthesized into dual-voice audio and published automatically via CI/CD. It is part personal experiment, part proof of concept for AI-generated educational content.',
  },
];

function Projects() {
  return (
    <main className="main">
      <section className="projects">
        <div className="container">
          <h2>Projects</h2>
          <p className="projects-intro">
            This page reflects five projects on my GitHub as of April 18, 2026.
            Each section links back to the source repo and calls out the current state of the
            work.
          </p>

          <div className="project-grid">
            {projects.map((project) => (
              <article className="project-card" key={project.repo}>
                <div className="project-card-header">
                  <div>
                    <h3>{project.title}</h3>
                    <p className="project-meta">
                      {project.repo} | {project.status} | Updated {project.updated}
                    </p>
                  </div>
                  <a
                    className="project-link"
                    href={project.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View Repo
                  </a>
                </div>
                <p>{project.description}</p>
                <ul>
                  {project.highlights.map((highlight) => (
                    <li key={highlight}>{highlight}</li>
                  ))}
                </ul>
                <div className="project-why">
                  <h4>Why I Built This</h4>
                  <p>{project.why}</p>
                </div>
                {project.spotifyUrl && (
                  <a href={project.spotifyUrl} target="_blank" rel="noopener noreferrer">Listen on Spotify</a>
                )}
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

export default Projects;
