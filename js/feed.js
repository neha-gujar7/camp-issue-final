// Common Campus Issue Feed Logic

let currentUser = null;

auth.onAuthStateChanged((user) => {
  if (!user) {
    window.location.replace("index.html");
    return;
  }

  currentUser = user;

  const emailEl = document.getElementById("userEmail");
  if (emailEl) emailEl.textContent = user.email;

  loadFeedIssues();
  loadResolvedFeedIssues();
});

// Load feed issues
async function loadFeedIssues(filterCategory = "all", filterPriority = "all", filterStatus = "all") {
  const container = document.getElementById("feedIssues");
  if (!container) return;
  
  container.innerHTML = "<p class='loading'>Loading public issues...</p>";

  try {
    const snapshot = await db.collection("issues").get();
    
    let publicIssues = [];
    snapshot.forEach(doc => {
      const issue = { id: doc.id, ...doc.data() };
      
      // Only show public, non-resolved, non-verified-resolved issues
      if (issue.visibility === "public" && issue.status !== "Resolved" && issue.verifiedResolved !== true) {
        // Apply filters
        if (filterCategory !== "all" && issue.category !== filterCategory) return;
        if (filterPriority !== "all" && issue.priority !== filterPriority) return;
        if (filterStatus !== "all" && issue.status !== filterStatus) return;
        
        publicIssues.push(issue);
      }
    });

    // Sort by creation date (newest first), then by priority
    publicIssues.sort((a, b) => {
      // First sort by date (newest first)
      let aTime = 0;
      let bTime = 0;
      
      try {
        if (a.createdAt?.toDate) {
          aTime = a.createdAt.toDate().getTime();
        } else if (a.timestamp) {
          aTime = new Date(a.timestamp).getTime();
        }
      } catch (e) {}
      
      try {
        if (b.createdAt?.toDate) {
          bTime = b.createdAt.toDate().getTime();
        } else if (b.timestamp) {
          bTime = new Date(b.timestamp).getTime();
        }
      } catch (e) {}
      
      if (bTime !== aTime) {
        return bTime - aTime; // Newest first
      }
      
      // Then by priority
      const priorityOrder = { "Critical": 4, "High": 3, "Medium": 2, "Low": 1 };
      const aPriority = priorityOrder[a.priority] || 1;
      const bPriority = priorityOrder[b.priority] || 1;
      if (bPriority !== aPriority) return bPriority - aPriority;
      
      // Finally by affected count
      return (b.affectedCount || 1) - (a.affectedCount || 1);
    });

    container.innerHTML = "";
    
    if (publicIssues.length === 0) {
      container.innerHTML = "<p>No public issues match the filters.</p>";
      return;
    }

    publicIssues.forEach(issue => {
      container.appendChild(createFeedIssueCard(issue));
    });
  } catch (error) {
    console.error("Error loading feed issues:", error);
    container.innerHTML = "<p class='error-message'>Error loading issues. Please refresh.</p>";
  }
}

// Create feed issue card
function createFeedIssueCard(issue) {
  const card = document.createElement("div");
  card.className = "issue-card feed-card";

  const statusClass = issue.status.toLowerCase().replace(" ", "-");
  const priorityClass = (issue.priority || "Medium").toLowerCase();
  
  let date = "N/A";
  let timeAgo = "";
  
  try {
    let issueDate;
    if (issue.createdAt) {
      if (typeof issue.createdAt.toDate === 'function') {
        issueDate = issue.createdAt.toDate();
      } else if (issue.createdAt.seconds) {
        issueDate = new Date(issue.createdAt.seconds * 1000);
      } else if (typeof issue.createdAt === 'string') {
        issueDate = new Date(issue.createdAt);
      } else if (issue.createdAt instanceof Date) {
        issueDate = issue.createdAt;
      }
    }
    
    if (!issueDate && issue.timestamp) {
      if (typeof issue.timestamp === 'string') {
        issueDate = new Date(issue.timestamp);
      } else if (issue.timestamp.toDate && typeof issue.timestamp.toDate === 'function') {
        issueDate = issue.timestamp.toDate();
      } else if (issue.timestamp.seconds) {
        issueDate = new Date(issue.timestamp.seconds * 1000);
      } else {
        issueDate = new Date(issue.timestamp);
      }
    }
    
    if (!issueDate || isNaN(issueDate.getTime())) {
      issueDate = new Date();
    }
    
    date = issueDate.toLocaleDateString();
    timeAgo = getTimeAgo(issueDate);
  } catch (e) {
    console.error("Date parsing error:", e);
    date = "N/A";
    timeAgo = "";
  }

  const affectedCount = issue.affectedCount || 1;
  const hasClickedMeToo = issue.affectedUsers?.includes(currentUser?.uid) || false;

  card.innerHTML = `
    <div class="issue-header">
      <div class="issue-title-section">
        <h3>${getPriorityIcon(issue.priority)} ${issue.title || "Untitled Issue"}</h3>
        <span class="priority-badge priority-${priorityClass}">${issue.priority || "Medium"}</span>
        <span class="status-badge status-${statusClass}">${issue.status}</span>
      </div>
    </div>
    <p class="issue-description">${issue.description}</p>
    <div class="issue-meta">
      <span><strong>Category:</strong> ${issue.category}</span>
      <span><strong>Location:</strong> ${issue.location}</span>
      <span><strong>Raised:</strong> ${timeAgo || date}</span>
    </div>
    <div class="me-too-section">
      <button class="btn-me-too ${hasClickedMeToo ? 'clicked' : ''}" 
              onclick="handleMeTooFeed('${issue.id}', ${hasClickedMeToo})" 
              ${hasClickedMeToo ? 'disabled' : ''}>
        ${hasClickedMeToo ? '✓ I face this too' : '👥 I face this too'}
      </button>
      <span class="affected-count">👥 ${affectedCount} ${affectedCount === 1 ? 'student' : 'students'} affected</span>
    </div>
    ${issue.imageUrl ? `<img src="${issue.imageUrl}" alt="Issue image" class="issue-image">` : ""}
    <div class="issue-actions">
      <a href="issue-detail.html?id=${issue.id}" class="btn-link">View Details & Timeline →</a>
    </div>
  `;

  return card;
}

// Handle "Me Too" button click in feed
async function handleMeTooFeed(issueId, alreadyClicked) {
  if (alreadyClicked || !currentUser) return;

  const btn = event?.target || document.querySelector(`[onclick*="${issueId}"]`);
  
  try {
    const issueRef = db.collection("issues").doc(issueId);
    const issueDoc = await issueRef.get();
    
    if (!issueDoc.exists) {
      console.error("Issue not found:", issueId);
      return;
    }

    const issue = issueDoc.data();
    const affectedUsers = issue.affectedUsers || [];
    
    if (affectedUsers.includes(currentUser.uid)) {
      return;
    }

    affectedUsers.push(currentUser.uid);
    
    // Update priority based on affected count
    let newPriority = issue.priority || "Medium";
    if (affectedUsers.length >= 50) {
      newPriority = "Critical";
    } else if (affectedUsers.length >= 20) {
      newPriority = "High";
    } else if (affectedUsers.length >= 10) {
      newPriority = "Medium";
    }

    await issueRef.update({
      affectedUsers: affectedUsers,
      affectedCount: affectedUsers.length,
      priority: newPriority
    });

    // Update button state
    if (btn) {
      btn.classList.add('clicked');
      btn.disabled = true;
      btn.textContent = '✓ I face this too';
    }

    // Reload feed
    const categoryFilter = document.getElementById("feedCategoryFilter")?.value || "all";
    const priorityFilter = document.getElementById("feedPriorityFilter")?.value || "all";
    const statusFilter = document.getElementById("feedStatusFilter")?.value || "all";
    loadFeedIssues(categoryFilter, priorityFilter, statusFilter);
    
    console.log("Successfully added 'Me Too' vote");
    
  } catch (error) {
    console.error("Error handling Me Too:", error);
    // Only show error if it's a real failure
    if (error.code !== 'permission-denied' && !error.message.includes('already')) {
      alert("Failed to update. Please try again.");
    }
  }
}

// Helper functions
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

function getPriorityIcon(priority) {
  const icons = {
    "Critical": "🔴",
    "High": "🟠",
    "Medium": "🟡",
    "Low": "🟢"
  };
  return icons[priority] || "🟡";
}

// Filter handlers
document.addEventListener("DOMContentLoaded", function() {
  const categoryFilter = document.getElementById("feedCategoryFilter");
  const priorityFilter = document.getElementById("feedPriorityFilter");
  const statusFilter = document.getElementById("feedStatusFilter");
  
  if (categoryFilter) {
    categoryFilter.addEventListener("change", function() {
      loadFeedIssues(this.value, priorityFilter?.value || "all", statusFilter?.value || "all");
    });
  }
  
  if (priorityFilter) {
    priorityFilter.addEventListener("change", function() {
      loadFeedIssues(categoryFilter?.value || "all", this.value, statusFilter?.value || "all");
    });
  }
  
  if (statusFilter) {
    statusFilter.addEventListener("change", function() {
      loadFeedIssues(categoryFilter?.value || "all", priorityFilter?.value || "all", this.value);
    });
  }
});

// Logout function
function logout() {
  signOut().then(() => {
    window.location.href = "index.html";
  });
}

// Load resolved feed issues (shown to students based on visibility: public to all, private only to creator)
async function loadResolvedFeedIssues() {
  const container = document.getElementById("resolvedFeedIssues");
  if (!container) {
    console.error("resolvedFeedIssues container not found");
    return;
  }
  
  // Check if db is available
  if (!db) {
    console.error("Database not initialized");
    container.innerHTML = "<p class='error-message'>Database not initialized. Please refresh.</p>";
    return;
  }
  
  container.innerHTML = "<p class='loading'>Loading resolved issues...</p>";

  try {
    // Get all issues
    const snapshot = await db.collection("issues").get();
    
    let resolvedIssues = [];
    
    snapshot.forEach(doc => {
      try {
        const issue = { id: doc.id, ...doc.data() };
        
        // Show resolved issues based on visibility:
        // - Public issues: visible to all students
        // - Private issues: visible only to the student who created them
        if (issue.status === "Resolved") {
          const isPublic = issue.visibility === "public";
          const isOwnPrivate = issue.visibility === "private" && currentUser && issue.uid === currentUser.uid;
          
          if (isPublic || isOwnPrivate) {
            resolvedIssues.push(issue);
          }
        }
      } catch (e) {
        console.error("Error processing document:", e);
      }
    });

    // Sort by resolution date (newest first)
    resolvedIssues.sort((a, b) => {
      let aTime = 0;
      let bTime = 0;
      
      try {
        if (a.resolvedAt?.toDate) {
          aTime = a.resolvedAt.toDate().getTime();
        } else if (a.createdAt?.toDate) {
          aTime = a.createdAt.toDate().getTime();
        } else if (a.createdAt?.seconds) {
          aTime = a.createdAt.seconds * 1000;
        } else if (a.timestamp) {
          aTime = typeof a.timestamp.toDate === 'function' ? a.timestamp.toDate().getTime() :
                  (a.timestamp.seconds ? a.timestamp.seconds * 1000 : new Date(a.timestamp).getTime());
        }
      } catch (e) {
        console.error("Error parsing date for issue a:", e);
      }
      
      try {
        if (b.resolvedAt?.toDate) {
          bTime = b.resolvedAt.toDate().getTime();
        } else if (b.createdAt?.toDate) {
          bTime = b.createdAt.toDate().getTime();
        } else if (b.createdAt?.seconds) {
          bTime = b.createdAt.seconds * 1000;
        } else if (b.timestamp) {
          bTime = typeof b.timestamp.toDate === 'function' ? b.timestamp.toDate().getTime() :
                  (b.timestamp.seconds ? b.timestamp.seconds * 1000 : new Date(b.timestamp).getTime());
        }
      } catch (e) {
        console.error("Error parsing date for issue b:", e);
      }
      
      return bTime - aTime; // Newest first
    });

    console.log(`Found ${resolvedIssues.length} resolved issues`);
    container.innerHTML = "";
    
    if (resolvedIssues.length === 0) {
      container.innerHTML = "<p>No resolved issues yet.</p>";
      return;
    }

    resolvedIssues.forEach(issue => {
      try {
        container.appendChild(createResolvedFeedIssueCard(issue));
      } catch (e) {
        console.error("Error creating card for issue:", issue.id, e);
      }
    });
    console.log("Resolved issues loaded successfully");
  } catch (error) {
    console.error("Error loading resolved feed issues:", error);
    container.innerHTML = `<p class='error-message'>Error loading resolved issues: ${error.message}. Please refresh the page.</p>`;
  }
}

// Create resolved feed issue card
function createResolvedFeedIssueCard(issue) {
  const card = document.createElement("div");
  card.className = "issue-card feed-card resolved-card";

  const statusClass = issue.status.toLowerCase().replace(" ", "-");
  const priorityClass = (issue.priority || "Medium").toLowerCase();
  
  let date = "N/A";
  let timeAgo = "";
  let resolvedDate = "N/A";
  let resolvedTimeAgo = "";
  
  try {
    let issueDate;
    if (issue.createdAt) {
      if (typeof issue.createdAt.toDate === 'function') {
        issueDate = issue.createdAt.toDate();
      } else if (issue.createdAt.seconds) {
        issueDate = new Date(issue.createdAt.seconds * 1000);
      } else if (typeof issue.createdAt === 'string') {
        issueDate = new Date(issue.createdAt);
      } else if (issue.createdAt instanceof Date) {
        issueDate = issue.createdAt;
      }
    }
    
    if (!issueDate && issue.timestamp) {
      if (typeof issue.timestamp === 'string') {
        issueDate = new Date(issue.timestamp);
      } else if (issue.timestamp.toDate && typeof issue.timestamp.toDate === 'function') {
        issueDate = issue.timestamp.toDate();
      } else if (issue.timestamp.seconds) {
        issueDate = new Date(issue.timestamp.seconds * 1000);
      } else {
        issueDate = new Date(issue.timestamp);
      }
    }
    
    if (!issueDate || isNaN(issueDate.getTime())) {
      issueDate = new Date();
    }
    
    date = issueDate.toLocaleDateString();
    timeAgo = getTimeAgo(issueDate);

    // Get resolved date
    if (issue.resolvedAt) {
      let resolvedDateObj;
      if (typeof issue.resolvedAt.toDate === 'function') {
        resolvedDateObj = issue.resolvedAt.toDate();
      } else if (issue.resolvedAt.seconds) {
        resolvedDateObj = new Date(issue.resolvedAt.seconds * 1000);
      } else if (typeof issue.resolvedAt === 'string') {
        resolvedDateObj = new Date(issue.resolvedAt);
      }
      
      if (resolvedDateObj && !isNaN(resolvedDateObj.getTime())) {
        resolvedDate = resolvedDateObj.toLocaleDateString();
        resolvedTimeAgo = getTimeAgo(resolvedDateObj);
      }
    }
  } catch (e) {
    console.error("Date parsing error:", e);
    date = "N/A";
    timeAgo = "";
  }

  const affectedCount = issue.affectedCount || 1;

  card.innerHTML = `
    <div class="issue-header">
      <div class="issue-title-section">
        <h3>${getPriorityIcon(issue.priority)} ${issue.title || "Untitled Issue"}</h3>
        <span class="priority-badge priority-${priorityClass}">${issue.priority || "Medium"}</span>
        <span class="status-badge status-${statusClass}">✅ ${issue.status}</span>
      </div>
    </div>
    <p class="issue-description">${issue.description}</p>
    <div class="issue-meta">
      <span><strong>Category:</strong> ${issue.category}</span>
      <span><strong>Location:</strong> ${issue.location}</span>
      <span><strong>Raised:</strong> ${timeAgo || date}</span>
      ${resolvedTimeAgo ? `<span><strong>Resolved:</strong> ${resolvedTimeAgo}</span>` : ''}
    </div>
    ${issue.resolutionNote ? `
      <div class="resolution-note">
        <strong>Resolution Note:</strong> ${issue.resolutionNote}
      </div>
    ` : ''}
    ${issue.imageUrl ? `<img src="${issue.imageUrl}" alt="Issue image" class="issue-image">` : ""}
    ${issue.resolutionImageUrl ? `<img src="${issue.resolutionImageUrl}" alt="Resolution proof" class="issue-image">` : ""}
    <div class="issue-actions">
      <a href="issue-detail.html?id=${issue.id}" class="btn-link">View Details & Timeline →</a>
    </div>
  `;

  return card;
}

// Make functions globally accessible
window.logout = logout;
window.handleMeTooFeed = handleMeTooFeed;

