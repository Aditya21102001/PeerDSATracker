document.addEventListener('DOMContentLoaded', () => {
  const fields = ['fullName', 'email', 'phone', 'linkedIn', 'github', 'currentRole'];

  // Load stored profile
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['peerdsa_profile'], (res) => {
      if (res.peerdsa_profile) {
        fields.forEach(f => {
          const el = document.getElementById(f);
          if (el && res.peerdsa_profile[f]) {
            el.value = res.peerdsa_profile[f];
          }
        });
      }
    });
  }

  const saveBtn = document.getElementById('saveBtn');
  const statusMsg = document.getElementById('statusMsg');

  saveBtn.addEventListener('click', () => {
    const profile = {};
    fields.forEach(f => {
      const el = document.getElementById(f);
      if (el) profile[f] = el.value.trim();
    });

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ peerdsa_profile: profile }, () => {
        statusMsg.style.display = 'block';
        setTimeout(() => { statusMsg.style.display = 'none'; }, 2000);
      });
    } else {
      statusMsg.style.display = 'block';
      setTimeout(() => { statusMsg.style.display = 'none'; }, 2000);
    }
  });
});
