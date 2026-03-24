import React, { useState } from 'react';

function Contact() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    project: '',
    term: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  const handleChange = (event) => {
    setFormData({
      ...formData,
      [event.target.name]: event.target.value
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage('');
    setIsError(false);

    try {
      const apiUrl =
        process.env.REACT_APP_CONTACT_API_URL ||
        'https://k7cpfmv07e.execute-api.us-east-1.amazonaws.com/prod/contact';

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      const result = await response.json();

      if (response.ok) {
        setMessage(result.message || "Message sent successfully! I'll get back to you soon.");
        setFormData({
          name: '',
          email: '',
          company: '',
          project: '',
          term: ''
        });
      } else {
        setIsError(true);
        setMessage(result.error || 'Failed to send message. Please try again.');
      }
    } catch (error) {
      console.error('Error submitting form:', error);
      setIsError(true);
      setMessage('Failed to send message. Please try again later.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="main">
      <section className="contact">
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <img
              src="/whiteglovesolutions.png"
              alt="White Glove Solutions"
              style={{
                maxWidth: '200px',
                height: 'auto',
                marginBottom: '1rem'
              }}
            />
            <h2>Get In Touch</h2>
            <p style={{ fontStyle: 'italic', color: '#888', marginTop: '0.5rem' }}>
              White Glove Solutions - Premium SRE &amp; Cloud Architecture Consulting
            </p>
          </div>
          <p>
            Interested in consulting services? I'm open to part-time projects that align with my
            expertise in SRE, cloud architecture, and observability. Fill out the form below and
            I'll get back to you.
          </p>

          {message && (
            <div className={`form-message ${isError ? 'error' : 'success'}`}>{message}</div>
          )}

          <form className="contact-form" onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="name">Name *</label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  disabled={isSubmitting}
                />
              </div>
              <div className="form-group">
                <label htmlFor="email">Email *</label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="company">Company</label>
              <input
                type="text"
                id="company"
                name="company"
                value={formData.company}
                onChange={handleChange}
                disabled={isSubmitting}
              />
            </div>

            <div className="form-group">
              <label htmlFor="project">Project Description *</label>
              <textarea
                id="project"
                name="project"
                rows="4"
                value={formData.project}
                onChange={handleChange}
                placeholder="Describe your project, goals, and how I can help..."
                required
                disabled={isSubmitting}
              />
            </div>

            <div className="form-group">
              <label htmlFor="term">Project Term</label>
              <select
                id="term"
                name="term"
                value={formData.term}
                onChange={handleChange}
                disabled={isSubmitting}
              >
                <option value="">Select duration</option>
                <option value="1-2 weeks">1-2 weeks</option>
                <option value="1 month">1 month</option>
                <option value="2-3 months">2-3 months</option>
                <option value="3-6 months">3-6 months</option>
                <option value="6+ months">6+ months</option>
                <option value="ongoing">Ongoing</option>
              </select>
            </div>

            <button type="submit" className="submit-btn" disabled={isSubmitting}>
              {isSubmitting ? 'Sending...' : 'Send Message'}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

export default Contact;
