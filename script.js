const yearElement = document.getElementById('year');
if (yearElement) {
  yearElement.textContent = new Date().getFullYear();
}

const menuToggle = document.querySelector('.menu-toggle');
const navLinks = document.querySelector('.nav-links');

if (menuToggle && navLinks) {
  menuToggle.addEventListener('click', () => {
    const isOpen = navLinks.classList.toggle('active');
    menuToggle.classList.toggle('active', isOpen);
    menuToggle.setAttribute('aria-expanded', String(isOpen));
  });
}

document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener('click', (event) => {
    const target = document.querySelector(anchor.getAttribute('href'));

    if (!target) {
      return;
    }

    event.preventDefault();
    target.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });

    if (navLinks && navLinks.classList.contains('active')) {
      navLinks.classList.remove('active');
      menuToggle.classList.remove('active');
      menuToggle.setAttribute('aria-expanded', 'false');
    }
  });
});

const navbar = document.querySelector('.navbar');
if (navbar) {
  window.addEventListener('scroll', () => {
    if (window.scrollY > 100) {
      navbar.style.background = 'rgba(255, 255, 255, 0.95)';
      navbar.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.1)';
    } else {
      navbar.style.background = 'rgba(255, 255, 255, 0.84)';
      navbar.style.boxShadow = 'none';
    }
  });
}

const revealItems = document.querySelectorAll(
  '.section-header, .service-card, .split-grid, .case-card, .section-cta, .process-grid article, .industry-list span, .final-cta > div'
);

if ('IntersectionObserver' in window) {
  revealItems.forEach((item) => item.classList.add('reveal'));

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.16
  });

  revealItems.forEach((item) => revealObserver.observe(item));
}

// Logo carousel rotation
const logoSlides = document.querySelectorAll('.logo-slide');
let currentLogoIndex = 0;

function rotateLogo() {
  logoSlides[currentLogoIndex].classList.remove('active');
  currentLogoIndex = (currentLogoIndex + 1) % logoSlides.length;
  logoSlides[currentLogoIndex].classList.add('active');
}

if (logoSlides.length > 0) {
  setInterval(rotateLogo, 7000);
}

// Contact form handling
const contactForm = document.getElementById('contact-form');
const formMessage = document.getElementById('form-message');

if (contactForm) {
  contactForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const submitButton = contactForm.querySelector('button[type="submit"]');
    const originalText = submitButton.textContent;
    
    // Disable button and show loading state
    submitButton.disabled = true;
    submitButton.textContent = 'Sending...';
    
    // Hide previous message
    formMessage.className = 'form-message';
    formMessage.style.display = 'none';
    
    try {
      const formData = {
        name: document.getElementById('name').value,
        email: document.getElementById('email').value,
        subject: document.getElementById('subject').value,
        message: document.getElementById('message').value
      };
      
      const response = await fetch('/.netlify/functions/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });
      
      const data = await response.json();
      
      if (response.ok) {
        formMessage.textContent = data.message || 'Thank you for your message. We\'ll get back to you soon!';
        formMessage.className = 'form-message success';
        contactForm.reset();
      } else {
        formMessage.textContent = data.error || 'Something went wrong. Please try again.';
        formMessage.className = 'form-message error';
      }
    } catch (error) {
      console.error('Form submission error:', error);
      formMessage.textContent = 'Network error. Please check your connection and try again.';
      formMessage.className = 'form-message error';
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = originalText;
    }
  });
}
