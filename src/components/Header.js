import React from 'react';
import { Link, useLocation } from 'react-router-dom';

function Header() {
  const location = useLocation();

  return (
    <header className="header">
      <div className="container">
        <div className="header-content">
          <div className="header-left">
            <div className="profile-section">
              <img src="/profile.jpg" alt="Eric Reilly" className="profile-image" />
              <div className="name-title">
                <h1>Eric Reilly</h1>
                <p>Senior Cloud Architect | Tampa, FL</p>
              </div>
            </div>
          </div>
          <div className="header-right">
            <nav className="nav">
              <Link to="/" className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}>
                About
              </Link>
              <Link
                to="/contact"
                className={`nav-link ${location.pathname === '/contact' ? 'active' : ''}`}
              >
                Contact
              </Link>
              <Link
                to="/projects"
                className={`nav-link ${location.pathname === '/projects' ? 'active' : ''}`}
              >
                Projects
              </Link>
            </nav>
            <div className="contact-links-header">
              <a
                href="https://www.linkedin.com/in/eric-reilly-769562155/"
                target="_blank"
                rel="noopener noreferrer"
              >
                LinkedIn
              </a>
              <a href="https://github.com/ericreilly999" target="_blank" rel="noopener noreferrer">
                GitHub
              </a>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

export default Header;
