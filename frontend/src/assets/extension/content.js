// PeerDSA Real-Time ATS Copilot Content Script
// Automatically detects and populates candidate details into Greenhouse, Lever, Ashby, Workday, and web application forms.

(function () {
  'use strict';

  // Only run in top-level window or significant iframe
  if (window.top !== window && window.innerWidth < 300) return;

  const DEFAULT_PROFILE = {
    firstName: 'Aditya',
    lastName: 'Yadav',
    fullName: 'Aditya Yadav',
    email: 'adityakumaryadav21102001@gmail.com',
    phone: '+91 9217665318',
    linkedIn: 'https://linkedin.com/in/aditya-yadav-9b4a48192',
    github: 'https://github.com/Aditya21102001',
    portfolio: 'https://peer-dsa-tracker-iota.vercel.app/portfolio',
    currentCompany: 'Tata Consultancy Services',
    currentRole: 'Software Developer',
    yearsOfExperience: '3.0',
    noticePeriod: '30',
    location: 'Gorakhpur, India',
    coverLetter: 'I am excited to apply for this opening. With 3 years of enterprise experience building modern Angular (v22 zoneless/signals), Spring Boot microservices, Azure OpenAI GenAI features, and FFmpeg/HLS adaptive streaming, I am confident in delivering high performance and immediate impact.'
  };

  function getStoredProfile(callback) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['peerdsa_profile'], (res) => {
        callback(res.peerdsa_profile || DEFAULT_PROFILE);
      });
    } else {
      callback(DEFAULT_PROFILE);
    }
  }

  function setNativeValue(element, value) {
    const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
    const prototype = Object.getPrototypeOf(element);
    const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

    if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
      prototypeValueSetter.call(element, value);
    } else if (valueSetter) {
      valueSetter.call(element, value);
    } else {
      element.value = value;
    }

    element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true }));
  }

  function detectAndFill(profile) {
    let filledCount = 0;
    const inputs = document.querySelectorAll('input, textarea, select');

    inputs.forEach((el) => {
      if (el.type === 'hidden' || el.type === 'submit' || el.disabled || el.readOnly) return;

      const tag = el.tagName.toLowerCase();
      const type = (el.type || 'text').toLowerCase();
      const name = (el.name || '').toLowerCase();
      const id = (el.id || '').toLowerCase();
      const placeholder = (el.placeholder || '').toLowerCase();
      const aria = (el.getAttribute('aria-label') || '').toLowerCase();
      const autocomplete = (el.autocomplete || '').toLowerCase();

      const descriptor = `${name} ${id} ${placeholder} ${aria} ${autocomplete}`;

      let valueToSet = null;

      // 1. Email
      if (type === 'email' || descriptor.includes('email')) {
        valueToSet = profile.email;
      }
      // 2. Phone
      else if (type === 'tel' || descriptor.includes('phone') || descriptor.includes('mobile')) {
        valueToSet = profile.phone;
      }
      // 3. First Name
      else if (descriptor.includes('first_name') || descriptor.includes('firstname') || descriptor.includes('given-name') || descriptor.includes('first name')) {
        valueToSet = profile.firstName || profile.fullName.split(' ')[0];
      }
      // 4. Last Name
      else if (descriptor.includes('last_name') || descriptor.includes('lastname') || descriptor.includes('family-name') || descriptor.includes('last name') || descriptor.includes('surname')) {
        valueToSet = profile.lastName || profile.fullName.split(' ').slice(1).join(' ');
      }
      // 5. Full Name
      else if (descriptor.includes('fullname') || descriptor.includes('full_name') || (descriptor.includes('name') && !descriptor.includes('company') && !descriptor.includes('user'))) {
        valueToSet = profile.fullName;
      }
      // 6. LinkedIn
      else if (descriptor.includes('linkedin')) {
        valueToSet = profile.linkedIn;
      }
      // 7. GitHub
      else if (descriptor.includes('github') || descriptor.includes('git_hub')) {
        valueToSet = profile.github;
      }
      // 8. Portfolio / Website
      else if (descriptor.includes('portfolio') || descriptor.includes('website') || descriptor.includes('url') || descriptor.includes('blog')) {
        valueToSet = profile.portfolio;
      }
      // 9. Current Company
      else if (descriptor.includes('company') || descriptor.includes('employer') || descriptor.includes('organization')) {
        valueToSet = profile.currentCompany;
      }
      // 10. Current Role / Title
      else if (descriptor.includes('role') || descriptor.includes('title') || descriptor.includes('designation')) {
        valueToSet = profile.currentRole;
      }
      // 11. Location / City
      else if (descriptor.includes('location') || descriptor.includes('city') || descriptor.includes('address')) {
        valueToSet = profile.location;
      }
      // 12. Experience Years
      else if (descriptor.includes('experience') || descriptor.includes('yoe') || descriptor.includes('years')) {
        valueToSet = profile.yearsOfExperience;
      }
      // 13. Notice Period
      else if (descriptor.includes('notice') || descriptor.includes('availability')) {
        valueToSet = profile.noticePeriod;
      }
      // 14. Cover Letter / Notes
      else if (tag === 'textarea' && (descriptor.includes('cover') || descriptor.includes('letter') || descriptor.includes('summary') || descriptor.includes('note') || descriptor.includes('additional'))) {
        valueToSet = profile.coverLetter;
      }

      if (valueToSet && (!el.value || el.value.trim() === '')) {
        setNativeValue(el, valueToSet);
        el.style.transition = 'all 0.3s ease';
        el.style.borderColor = '#10b981';
        el.style.boxShadow = '0 0 0 3px rgba(16, 185, 129, 0.25)';
        filledCount++;
      }
    });

    return filledCount;
  }

  function injectCopilotWidget() {
    if (document.getElementById('peerdsa-copilot-badge')) return;

    const widget = document.createElement('div');
    widget.id = 'peerdsa-copilot-badge';
    widget.innerHTML = `
      <div style="position: fixed; bottom: 24px; right: 24px; z-index: 999999; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <div style="background: linear-gradient(135deg, #1e1b4b, #312e81); color: #fff; padding: 12px 18px; border-radius: 12px; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.15); display: flex; align-items: center; gap: 12px; font-size: 13px;">
          <div style="width: 28px; height: 28px; background: #6366f1; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 14px;">⚡</div>
          <div>
            <div style="font-weight: 600; color: #e0e7ff;">PeerDSA ATS Copilot</div>
            <div style="font-size: 11px; color: #a5b4fc;" id="peerdsa-copilot-status">Ready to auto-fill opening</div>
          </div>
          <button id="peerdsa-autofill-btn" style="background: #10b981; hover:background: #059669; color: white; border: none; padding: 6px 14px; border-radius: 6px; font-weight: 600; font-size: 12px; cursor: pointer; transition: all 0.2s;">
            1-Click Fill
          </button>
          <button id="peerdsa-close-btn" style="background: transparent; color: #94a3b8; border: none; font-size: 16px; cursor: pointer; padding: 0 4px;">&times;</button>
        </div>
      </div>
    `;

    document.body.appendChild(widget);

    const btn = document.getElementById('peerdsa-autofill-btn');
    const status = document.getElementById('peerdsa-copilot-status');
    const closeBtn = document.getElementById('peerdsa-close-btn');

    btn.addEventListener('click', () => {
      getStoredProfile((profile) => {
        const count = detectAndFill(profile);
        if (count > 0) {
          status.textContent = `Auto-filled ${count} fields!`;
          status.style.color = '#34d399';
          btn.textContent = 'Filled!';
          btn.style.background = '#059669';
        } else {
          status.textContent = 'Fields already populated';
        }
      });
    });

    closeBtn.addEventListener('click', () => {
      widget.remove();
    });
  }

  // Check if current page is a career/job apply portal
  const url = window.location.href.toLowerCase();
  const isJobPage = url.includes('greenhouse.io') ||
    url.includes('lever.co') ||
    url.includes('workday') ||
    url.includes('ashbyhq.com') ||
    url.includes('arbeitnow.com') ||
    url.includes('remotive.com') ||
    url.includes('apply') ||
    url.includes('career') ||
    url.includes('job') ||
    document.querySelector('form[action*="apply" i], input[type="email"], textarea[name*="cover" i]');

  if (isJobPage) {
    setTimeout(injectCopilotWidget, 1200);
  }
})();
