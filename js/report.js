// Student Issue Reporting Logic

// Get current user
let currentUser = null;

auth.onAuthStateChanged((user) => {
  if (!user) {
    window.location.replace("index.html");
    return;
  }

  currentUser = user;

  const emailEl = document.getElementById("userEmail");
  if (emailEl) emailEl.textContent = user.email;

  loadUserIssues();
  loadPublicIssues();
  
  // Check for expired verification windows periodically
  setInterval(checkAllVerificationWindows, 60000); // Check every minute
});

// Check all verification windows (run periodically)
async function checkAllVerificationWindows() {
  try {
    // Get all issues and filter client-side to avoid index issues
    const snapshot = await db.collection("issues").get();
    const now = new Date();
    
    snapshot.forEach(async (doc) => {
      const issue = { id: doc.id, ...doc.data() };
      
      // Only check resolved issues with verification deadline
      if (issue.status === "Resolved" && issue.verificationDeadline && !issue.verifiedResolved) {
        const deadline = issue.verificationDeadline.toDate ? 
          issue.verificationDeadline.toDate() : 
          new Date(issue.verificationDeadline);
        
        if (now > deadline) {
          // Auto-verify
          await db.collection("issues").doc(issue.id).update({
            verifiedResolved: true
          });
          
          // Add timeline event
          try {
            await db.collection("issueTimeline").add({
              issueId: issue.id,
              type: "verified",
              message: "Issue auto-verified (verification window expired)",
              user: "System",
              timestamp: firebase.firestore?.FieldValue?.serverTimestamp ? 
                firebase.firestore.FieldValue.serverTimestamp() : 
                { toDate: () => new Date() }
            });
          } catch (e) {
            console.error("Error adding timeline event:", e);
          }
        }
      }
    });
  } catch (error) {
    // Silently fail - this is a background check
    console.log("Verification window check:", error.message);
  }
}


// Handle image preview - wait for DOM
document.addEventListener("DOMContentLoaded", function () {
  const issueImageInput = document.getElementById("issueImage");
  if (issueImageInput) {
    issueImageInput.addEventListener("change", function (e) {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = function (e) {
          document.getElementById("imagePreview").src = e.target.result;
          document.getElementById("imagePreview").style.display = "block";
        };
        reader.readAsDataURL(file);
      }
    });
  }
});

// Submit issue (global function for form handler)
async function submitIssue(event) {
  event.preventDefault();

  const submitBtn = document.getElementById("submitBtn");
  const errorMsg = document.getElementById("errorMsg");
  const successMsg = document.getElementById("successMsg");

  // Reset messages
  errorMsg.textContent = "";
  successMsg.textContent = "";
  submitBtn.disabled = true;
  submitBtn.textContent = "Submitting...";

  try {
    // Get form data
    const title = document.getElementById("title").value.trim();
    const description = document.getElementById("description").value.trim();
    const category = document.getElementById("category").value;
    const location = document.getElementById("location").value.trim();
    const imageFile = document.getElementById("issueImage").files[0];

    // Validate
    if (!title || !description || !category || !location) {
      throw new Error("Please fill in all required fields");
    }

    let imageUrl = "";

    // Upload image if provided - ALWAYS use base64 (stored in Firestore, no Storage needed!)
    if (imageFile) {
      try {
        // Check file size (limit to 1MB for Firestore - base64 increases size by ~33%)
        const maxSize = 1024 * 1024; // 1MB
        if (imageFile.size > maxSize) {
          throw new Error("Image too large! Please use images smaller than 1MB.");
        }

        // Always convert to base64 - works with or without Firebase Storage
        // This way you don't need Storage setup at all!
        imageUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target.result); // Returns base64 data URL
          reader.onerror = reject;
          reader.readAsDataURL(imageFile);
        });

        console.log('✅ Image converted to base64 (stored in Firestore, no Storage needed!)');
      } catch (error) {
        console.warn('Image upload failed:', error);
        if (error.message.includes('too large')) {
          throw error; // Re-throw size errors
        }
        imageUrl = '';
      }
    }

    const visibility = document.getElementById("visibility").value;

    // Auto-detect priority and set SLA
    const priority = calculatePriority(category, description);
    const slaHours = getSLAHours(category, priority);
    const slaDeadline = new Date(Date.now() + slaHours * 60 * 60 * 1000);

    // Handle Timestamp creation (works with both Firebase and demo mode)
    let slaDeadlineTimestamp;
    if (firebase.firestore && firebase.firestore.Timestamp) {
      slaDeadlineTimestamp = firebase.firestore.Timestamp.fromDate(slaDeadline);
    } else {
      // Demo mode - use plain object
      slaDeadlineTimestamp = {
        toDate: () => slaDeadline,
        seconds: Math.floor(slaDeadline.getTime() / 1000)
      };
    }

    const issueData = {
      title,
      description,
      category,
      location,
      imageUrl,
      visibility,
      status: "Pending",
      priority: priority, // 🔴 Critical, 🟠 High, 🟡 Medium, 🟢 Low
      affectedCount: 1, // Start with 1 (the reporter)
      affectedUsers: [currentUser.uid], // Track users who clicked "Me Too"
      slaHours: slaHours,
      slaDeadline: slaDeadlineTimestamp,
      reportedBy: currentUser.email,
      uid: currentUser.uid,
      createdAt: firebase.firestore?.FieldValue?.serverTimestamp ? 
        firebase.firestore.FieldValue.serverTimestamp() : 
        { toDate: () => new Date() },
      resolvedAt: null
    };

    const issueRef = await db.collection("issues").add(issueData);

    // Add initial timeline event
    try {
      await db.collection("issueTimeline").add({
        issueId: issueRef.id,
        type: "reported",
        message: "Issue reported",
        user: currentUser.email,
        timestamp: firebase.firestore?.FieldValue?.serverTimestamp ? 
          firebase.firestore.FieldValue.serverTimestamp() : 
          { toDate: () => new Date() }
      });
    } catch (timelineError) {
      console.error("Error adding timeline event:", timelineError);
      // Continue even if timeline fails
    }

    // Success
    successMsg.textContent = "Issue reported successfully!";
    document.getElementById("issueForm").reset();
    document.getElementById("imagePreview").style.display = "none";

    // Load user's issues
    loadUserIssues();
    loadPublicIssues();

  } catch (error) {
    console.error("Error submitting issue:", error);
    errorMsg.textContent = error.message || "Failed to submit issue. Please try again.";
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Submit Issue";
  }
}

// Load user's reported issues (both active and resolved)
async function loadUserIssues() {
  const issuesContainer = document.getElementById("userIssues");
  if (!issuesContainer) return;
  
  issuesContainer.innerHTML = "<p class='loading'>Loading your issues...</p>";

  try {
    // Get all user issues and filter client-side to avoid index issues
    const snapshot = await db.collection("issues").get();
    
    let activeIssues = [];
    let resolvedIssues = [];
    snapshot.forEach(doc => {
      const issue = { id: doc.id, ...doc.data() };
      if (issue.uid === currentUser.uid) {
        if (issue.status === "Resolved") {
          resolvedIssues.push(issue);
        } else {
          activeIssues.push(issue);
        }
      }
    });

    // Sort active issues by createdAt (newest first)
    activeIssues.sort((a, b) => {
      const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.timestamp ? new Date(a.timestamp).getTime() : 0);
      const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.timestamp ? new Date(b.timestamp).getTime() : 0);
      return bTime - aTime;
    });

    // Sort resolved issues by resolvedAt (newest first)
    resolvedIssues.sort((a, b) => {
      let aTime = 0;
      let bTime = 0;
      if (a.resolvedAt?.toDate) {
        aTime = a.resolvedAt.toDate().getTime();
      } else if (a.createdAt?.toDate) {
        aTime = a.createdAt.toDate().getTime();
      }
      if (b.resolvedAt?.toDate) {
        bTime = b.resolvedAt.toDate().getTime();
      } else if (b.createdAt?.toDate) {
        bTime = b.createdAt.toDate().getTime();
      }
      return bTime - aTime;
    });

    issuesContainer.innerHTML = "";
    
    // Show active issues first
    if (activeIssues.length > 0) {
      activeIssues.forEach(issue => {
        issuesContainer.appendChild(createIssueCard(issue, false, true));
      });
    }

    // Show resolved issues after active ones
    if (resolvedIssues.length > 0) {
      resolvedIssues.forEach(issue => {
        issuesContainer.appendChild(createIssueCard(issue, false, true));
      });
    }

    if (activeIssues.length === 0 && resolvedIssues.length === 0) {
      issuesContainer.innerHTML = "<p>No issues reported yet.</p>";
      return;
    }
  } catch (error) {
    console.error("Error loading user issues:", error);
    issuesContainer.innerHTML = "<p class='error-message'>Error loading issues. Please refresh.</p>";
  }
}


// Create issue card element
function createIssueCard(issue, isAdminView = false, isMyIssue = false) {
  const card = document.createElement("div");
  const isResolved = issue.status === "Resolved";
  card.className = `issue-card ${isResolved ? 'resolved-card' : ''}`;

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
    
    // Validate the date
    if (!issueDate || !(issueDate instanceof Date) || isNaN(issueDate.getTime())) {
      date = "N/A";
      timeAgo = "";
    } else {
      date = issueDate.toLocaleDateString();
      timeAgo = getTimeAgo(issueDate);
    }
  } catch (e) {
    console.error("Date parsing error:", e);
    date = "N/A";
    timeAgo = "";
  }

  const affectedCount = issue.affectedCount || 1;
  const hasClickedMeToo = issue.affectedUsers?.includes(currentUser?.uid) || false;

  // Get resolved date if resolved
  let resolvedDate = "";
  let resolvedTimeAgo = "";
  if (isResolved && issue.resolvedAt) {
    try {
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
    } catch (e) {
      console.error("Error parsing resolved date:", e);
    }
  }

  card.innerHTML = `
    <div class="issue-header">
      <div class="issue-title-section">
        <h3>${issue.title || "Untitled Issue"}</h3>
        <span class="priority-badge priority-${priorityClass}">${getPriorityIcon(issue.priority)} ${issue.priority || "Medium"}</span>
      </div>
      <span class="status-badge status-${statusClass}">${isResolved ? '✅ ' : ''}${issue.status}</span>
    </div>
    <p class="issue-description">${issue.description}</p>
    <div class="issue-meta">
      <span><strong>Category:</strong> ${issue.category}</span>
      <span><strong>Location:</strong> ${issue.location}</span>
      <span><strong>Date:</strong> ${date}</span>
      ${timeAgo ? `<span><strong>Raised:</strong> ${timeAgo}</span>` : ""}
      ${resolvedTimeAgo ? `<span><strong>Resolved:</strong> ${resolvedTimeAgo}</span>` : ''}
    </div>
    ${issue.visibility === "public" && !isMyIssue && !isResolved ? `
      <div class="me-too-section">
        <button class="btn-me-too ${hasClickedMeToo ? 'clicked' : ''}" 
                onclick="handleMeToo('${issue.id}', ${hasClickedMeToo})" 
                ${hasClickedMeToo ? 'disabled' : ''}>
          ${hasClickedMeToo ? '✓ I face this too' : '👥 I face this too'}
        </button>
        <span class="affected-count">👥 ${affectedCount} ${affectedCount === 1 ? 'student' : 'students'} affected</span>
      </div>
    ` : ''}
    ${issue.imageUrl ? `<img src="${issue.imageUrl}" alt="Issue image" class="issue-image">` : ""}
    ${isResolved && issue.resolutionNote ? `
      <div class="resolution-note">
        <strong>✅ Resolution Note:</strong> ${issue.resolutionNote}
        ${issue.resolvedBy ? `<br><small style="color: #666; margin-top: 5px; display: block;">Resolved by: ${issue.resolvedBy}</small>` : ''}
      </div>
    ` : ''}
    ${isResolved && issue.resolutionImageUrl ? `<img src="${issue.resolutionImageUrl}" alt="Resolution proof" class="issue-image" style="margin-top: 15px;">` : ""}
    <div class="issue-actions">
      <a href="issue-detail.html?id=${issue.id}" class="btn-link">View Details & Timeline →</a>
    </div>
  `;

  return card;
}

// Handle "Me Too" button click
async function handleMeToo(issueId, alreadyClicked) {
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
    
    // Check if user already clicked
    if (affectedUsers.includes(currentUser.uid)) {
      return;
    }

    // Add user to affected list
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

    // Reload public issues
    loadPublicIssues();
    
    // Update button state
    if (btn) {
      btn.classList.add('clicked');
      btn.disabled = true;
      btn.textContent = '✓ I face this too';
    }
    
    // Silently succeed - no error message if it worked
    console.log("Successfully added 'Me Too' vote");
    
  } catch (error) {
    console.error("Error handling Me Too:", error);
    // Only show error if it's a real failure, not a silent success
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

function calculatePriority(category, description) {
  const text = (category + " " + description).toLowerCase();
  
  // Safety issues are always critical
  if (text.includes("safety") || text.includes("electric shock") || text.includes("fire") || 
      text.includes("danger") || text.includes("hazard") || text.includes("emergency")) {
    return "Critical";
  }
  
  // Water issues are high priority
  if (text.includes("water") || text.includes("plumbing") || text.includes("leak")) {
    return "High";
  }
  
  // Electricity issues are high priority
  if (text.includes("electric") || text.includes("power") || text.includes("light")) {
    return "High";
  }
  
  // Cleaning and infrastructure are medium
  if (text.includes("clean") || text.includes("infrastructure") || text.includes("wifi")) {
    return "Medium";
  }
  
  return "Medium";
}

function getSLAHours(category, priority) {
  const priorityHours = {
    "Critical": 2,
    "High": 6,
    "Medium": 24,
    "Low": 48
  };
  return priorityHours[priority] || 24;
}

// Logout function
function logout() {
  signOut().then(() => {
    window.location.href = "index.html";
  });
}

// Make functions globally accessible
window.logout = logout;
window.submitIssue = submitIssue;
window.handleMeToo = handleMeToo;



async function loadPublicIssues() {
  const container = document.getElementById("publicIssues");
  if (!container) return;
  
  container.innerHTML = "<p class='loading'>Loading public issues...</p>";

  try {
    // Get all issues and filter client-side
    const snapshot = await db.collection("issues").get();
    
    let publicIssues = [];
    snapshot.forEach(doc => {
      const issue = { id: doc.id, ...doc.data() };
      // Only show public, non-resolved issues
      if (issue.visibility === "public" && issue.status !== "Resolved") {
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
          const ts = typeof a.timestamp === 'string' ? new Date(a.timestamp) : 
                     (a.timestamp.toDate ? a.timestamp.toDate() : new Date(a.timestamp));
          aTime = ts.getTime();
        }
      } catch (e) {}
      
      try {
        if (b.createdAt?.toDate) {
          bTime = b.createdAt.toDate().getTime();
        } else if (b.timestamp) {
          const ts = typeof b.timestamp === 'string' ? new Date(b.timestamp) : 
                     (b.timestamp.toDate ? b.timestamp.toDate() : new Date(b.timestamp));
          bTime = ts.getTime();
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
      container.innerHTML = "<p>No public issues yet.</p>";
      return;
    }

    publicIssues.forEach(issue => {
      container.appendChild(createIssueCard(issue, false, false));
    });
  } catch (error) {
    console.error("Error loading public issues:", error);
    container.innerHTML = "<p class='error-message'>Error loading issues. Please refresh.</p>";
  }
}
