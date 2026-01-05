// Announcements Logic

let currentUser = null;
let isAdminUser = false;

auth.onAuthStateChanged((user) => {
  if (!user) {
    window.location.replace("index.html");
    return;
  }

  currentUser = user;
  isAdminUser = isAdmin(user.email);

  const emailEl = document.getElementById("userEmail");
  if (emailEl) emailEl.textContent = user.email;

  // Show admin form if admin
  if (isAdminUser) {
    const adminForm = document.getElementById("adminAnnouncementForm");
    if (adminForm) adminForm.style.display = "block";
    loadIssuesForAnnouncement();
  }

  loadAnnouncements();
});

// Load announcements
async function loadAnnouncements() {
  const container = document.getElementById("announcementsList");
  if (!container) return;

  container.innerHTML = "<p class='loading'>Loading announcements...</p>";

  try {
    const snapshot = await db.collection("announcements")
      .orderBy("createdAt", "desc")
      .get();

    container.innerHTML = "";

    if (snapshot.empty) {
      container.innerHTML = "<p>No announcements yet.</p>";
      return;
    }

    snapshot.forEach(doc => {
      const announcement = { id: doc.id, ...doc.data() };
      container.appendChild(createAnnouncementCard(announcement));
    });
  } catch (error) {
    console.error("Error loading announcements:", error);
    // Try without orderBy for demo mode
    try {
      const snapshot = await db.collection("announcements").get();
      container.innerHTML = "";
      
      let announcements = [];
      snapshot.forEach(doc => {
        announcements.push({ id: doc.id, ...doc.data() });
      });
      
      // Sort manually
      announcements.sort((a, b) => {
        const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 
                     (a.timestamp ? new Date(a.timestamp).getTime() : 0);
        const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 
                     (b.timestamp ? new Date(b.timestamp).getTime() : 0);
        return bTime - aTime;
      });
      
      if (announcements.length === 0) {
        container.innerHTML = "<p>No announcements yet.</p>";
        return;
      }
      
      announcements.forEach(announcement => {
        container.appendChild(createAnnouncementCard(announcement));
      });
    } catch (e) {
      container.innerHTML = "<p class='error-message'>Error loading announcements.</p>";
    }
  }
}

// Create announcement card
function createAnnouncementCard(announcement) {
  const card = document.createElement("div");
  card.className = "announcement-card";

  let date = "N/A";
  let timeAgo = "";
  
  try {
    let announcementDate;
    if (announcement.createdAt?.toDate) {
      announcementDate = announcement.createdAt.toDate();
    } else if (announcement.timestamp) {
      announcementDate = new Date(announcement.timestamp);
    } else {
      announcementDate = new Date();
    }
    
    if (announcementDate && !isNaN(announcementDate.getTime())) {
      date = announcementDate.toLocaleDateString();
      timeAgo = getTimeAgo(announcementDate);
    }
  } catch (e) {
    date = "N/A";
  }

  card.innerHTML = `
    <div class="announcement-header">
      <h3>📢 ${announcement.title}</h3>
      <span class="announcement-date">${timeAgo || date}</span>
    </div>
    <p class="announcement-message">${announcement.message}</p>
    ${announcement.relatedIssueId ? `
      <div class="announcement-issue-link">
        <a href="issue-detail.html?id=${announcement.relatedIssueId}" class="btn-link">View Related Issue →</a>
      </div>
    ` : ''}
    <div class="announcement-meta">
      <span>Posted by: <strong>${announcement.postedBy || "Admin"}</strong></span>
    </div>
  `;

  return card;
}

// Submit announcement (admin only)
async function submitAnnouncement(event) {
  event.preventDefault();

  if (!isAdminUser) {
    alert("Only admins can post announcements.");
    return;
  }

  const errorMsg = document.getElementById("announcementError");
  const successMsg = document.getElementById("announcementSuccess");
  errorMsg.textContent = "";
  successMsg.textContent = "";

  const title = document.getElementById("announcementTitle").value.trim();
  const message = document.getElementById("announcementMessage").value.trim();
  const relatedIssueId = document.getElementById("announcementIssueId").value;

  if (!title || !message) {
    errorMsg.textContent = "Please fill in all required fields.";
    return;
  }

  try {
    const announcementData = {
      title,
      message,
      relatedIssueId: relatedIssueId || null,
      postedBy: currentUser.email,
      createdAt: firebase.firestore?.FieldValue?.serverTimestamp ? 
        firebase.firestore.FieldValue.serverTimestamp() : 
        { toDate: () => new Date() }
    };

    await db.collection("announcements").add(announcementData);

    successMsg.textContent = "Announcement posted successfully!";
    document.getElementById("announcementForm").reset();
    
    // Reload announcements
    setTimeout(() => {
      loadAnnouncements();
      successMsg.textContent = "";
    }, 2000);

  } catch (error) {
    console.error("Error posting announcement:", error);
    errorMsg.textContent = "Failed to post announcement. Please try again.";
  }
}

// Load issues for announcement dropdown
async function loadIssuesForAnnouncement() {
  const select = document.getElementById("announcementIssueId");
  if (!select) return;

  try {
    const snapshot = await db.collection("issues").get();
    const issues = [];
    
    snapshot.forEach(doc => {
      const issue = { id: doc.id, ...doc.data() };
      if (issue.status !== "Resolved") {
        issues.push(issue);
      }
    });

    // Clear existing options except first
    while (select.options.length > 1) {
      select.remove(1);
    }

    issues.forEach(issue => {
      const option = document.createElement("option");
      option.value = issue.id;
      option.textContent = `${issue.title || "Untitled"} - ${issue.category}`;
      select.appendChild(option);
    });
  } catch (error) {
    console.error("Error loading issues:", error);
  }
}

// Helper function
function getTimeAgo(date) {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    return "";
  }
  const now = new Date();
  const diffMs = now - date;
  if (diffMs < 0) return "just now";
  
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

// Logout
function logout() {
  signOut().then(() => {
    window.location.href = "index.html";
  });
}

window.logout = logout;
window.submitAnnouncement = submitAnnouncement;

