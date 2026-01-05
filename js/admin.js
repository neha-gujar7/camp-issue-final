// Admin Dashboard Logic

// Get current user
// let currentUser = null;
// auth.onAuthStateChanged((user) => {
//   if (user) {
//     if (isAdmin(user.email)) {
//       currentUser = user;
//       document.getElementById("adminEmail").textContent = user.email;
//       loadAllIssues();
//     } else {
//       window.location.href = "report.html";
//     }
//   } else {
//     window.location.href = "index.html";
//   }
// });


auth.onAuthStateChanged((user) => {
  if (!user) {
    window.location.replace("index.html");
    return;
  }

  if (!isAdmin(user.email)) {
    window.location.replace("report.html");
    return;
  }

  currentUser = user;

  const emailEl = document.getElementById("adminEmail");
  if (emailEl) emailEl.textContent = user.email;

  loadAllIssues();
  
  // Check for expired verification windows periodically
  setInterval(checkAllVerificationWindows, 60000); // Check every minute
});

// Check all verification windows (run periodically)
async function checkAllVerificationWindows() {
  try {
    // Get all issues and filter client-side to avoid index issues
    const snapshot = await db.collection("issues").get();
    const now = new Date();
    
    // Use Promise.all to handle async operations properly
    const checks = [];
    
    snapshot.forEach((doc) => {
      const issue = { id: doc.id, ...doc.data() };
      
      // Only check resolved issues with verification deadline
      if (issue.status === "Resolved" && issue.verificationDeadline && !issue.verifiedResolved) {
        const deadline = issue.verificationDeadline.toDate ? 
          issue.verificationDeadline.toDate() : 
          new Date(issue.verificationDeadline);
        
        if (now > deadline) {
          // Auto-verify with proper error handling
          const checkPromise = (async () => {
            try {
              // Update issue to verifiedResolved: true
              await db.collection("issues").doc(issue.id).update({
                verifiedResolved: true
              });
              
              // Add timeline event with System user entry
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
              } catch (timelineError) {
                console.error("Error adding timeline event:", timelineError);
              }
            } catch (updateError) {
              console.error(`Error auto-verifying issue ${issue.id}:`, updateError);
            }
          })();
          
          checks.push(checkPromise);
        }
      }
    });
    
    // Wait for all checks to complete
    await Promise.all(checks);
  } catch (error) {
    console.error("Error checking verification windows:", error);
  }
}


// Load all issues (separate active and resolved)
async function loadAllIssues(filterStatus = "all", filterCategory = "all", filterPriority = "all") {
  try {
    const snapshot = await db.collection("issues").get();
    const issuesContainer = document.getElementById("allIssues");
    const resolvedContainer = document.getElementById("resolvedIssues");
    
    if (!issuesContainer) return;
    
    issuesContainer.innerHTML = "<p class='loading'>Loading issues...</p>";
    if (resolvedContainer) {
      resolvedContainer.innerHTML = "<p class='loading'>Loading resolved issues...</p>";
    }
    
    let activeIssues = [];
    let resolvedIssues = [];
    
    snapshot.forEach((doc) => {
      const issue = { id: doc.id, ...doc.data() };
      
      // Separate resolved from active
      if (issue.status === "Resolved") {
        resolvedIssues.push(issue);
      } else {
        // Apply filters for active issues
      if (filterStatus !== "all" && issue.status !== filterStatus) return;
      if (filterCategory !== "all" && issue.category !== filterCategory) return;
        if (filterPriority !== "all" && issue.priority !== filterPriority) return;
        
        activeIssues.push(issue);
      }
    });
    
    // Sort active issues by priority and SLA
    activeIssues.sort((a, b) => {
      const priorityOrder = { "Critical": 4, "High": 3, "Medium": 2, "Low": 1 };
      const aPriority = priorityOrder[a.priority] || 1;
      const bPriority = priorityOrder[b.priority] || 1;
      if (bPriority !== aPriority) return bPriority - aPriority;
      
      // Then by SLA deadline
      const aSLA = a.slaDeadline?.toDate ? a.slaDeadline.toDate().getTime() : Infinity;
      const bSLA = b.slaDeadline?.toDate ? b.slaDeadline.toDate().getTime() : Infinity;
      return aSLA - bSLA;
    });
    
    // Sort resolved issues by resolution date (newest first)
    resolvedIssues.sort((a, b) => {
      const aTime = a.resolvedAt?.toDate ? a.resolvedAt.toDate().getTime() : (a.timestamp ? new Date(a.timestamp).getTime() : 0);
      const bTime = b.resolvedAt?.toDate ? b.resolvedAt.toDate().getTime() : (b.timestamp ? new Date(b.timestamp).getTime() : 0);
      return bTime - aTime;
    });
    
    // Display active issues
    issuesContainer.innerHTML = "";
    if (activeIssues.length === 0) {
      issuesContainer.innerHTML = "<p class='no-issues'>No active issues match the filters.</p>";
    } else {
      activeIssues.forEach((issue) => {
      const issueCard = createAdminIssueCard(issue);
      issuesContainer.appendChild(issueCard);
    });
    }
    
    // Display resolved issues
    if (resolvedContainer) {
      resolvedContainer.innerHTML = "";
      if (resolvedIssues.length === 0) {
        resolvedContainer.innerHTML = "<p class='no-issues'>No resolved issues yet.</p>";
      } else {
        resolvedIssues.forEach((issue) => {
          const issueCard = createAdminIssueCard(issue, true);
          resolvedContainer.appendChild(issueCard);
        });
      }
    }
    
    // Update stats
    updateStats();
    
  } catch (error) {
    console.error("Error loading issues:", error);
    const issuesContainer = document.getElementById("allIssues");
    if (issuesContainer) {
      issuesContainer.innerHTML = "<p class='error-message'>Error loading issues. Please refresh.</p>";
    }
  }
}

// Create admin issue card with enhanced features
function createAdminIssueCard(issue, isResolved = false) {
  const card = document.createElement("div");
  card.className = `issue-card admin-card ${isResolved ? 'resolved-card' : ''}`;
  
  const statusClass = issue.status.toLowerCase().replace(" ", "-");
  const priorityClass = (issue.priority || "Medium").toLowerCase();
  
  let date = "N/A";
  let timeAgo = "";
  let slaInfo = "";
  
  try {
    let issueDate;
    if (issue.createdAt?.toDate) {
      issueDate = issue.createdAt.toDate();
    } else if (issue.timestamp) {
      issueDate = new Date(issue.timestamp);
    } else {
      issueDate = new Date();
    }
    date = issueDate.toLocaleDateString();
    timeAgo = getTimeAgo(issueDate);
    
    // Calculate SLA
    if (!isResolved && issue.slaDeadline) {
      const slaDeadline = issue.slaDeadline.toDate ? issue.slaDeadline.toDate() : new Date(issue.slaDeadline);
      const now = new Date();
      const timeLeft = slaDeadline - now;
      const hoursLeft = Math.floor(timeLeft / (1000 * 60 * 60));
      const minutesLeft = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
      
      if (timeLeft < 0) {
        slaInfo = `<span class="sla-badge sla-missed">⚠️ SLA MISSED - ${Math.abs(hoursLeft)}h overdue</span>`;
      } else if (hoursLeft < 1) {
        slaInfo = `<span class="sla-badge sla-urgent">⏳ ${minutesLeft}m left</span>`;
      } else if (hoursLeft < 2) {
        slaInfo = `<span class="sla-badge sla-warning">⏳ ${hoursLeft}h ${minutesLeft}m left</span>`;
      } else {
        slaInfo = `<span class="sla-badge sla-ok">⏳ ${hoursLeft}h left</span>`;
      }
      }
    } catch (e) {
      date = "N/A";
    }
  
  const affectedCount = issue.affectedCount || 1;
  // Generate issue ID from document ID or timestamp
  let issueId = issue.id;
  if (issueId && issueId.startsWith('issue_')) {
    issueId = `SR-${issueId.replace('issue_', '').substring(0, 8)}`;
  } else if (issueId) {
    issueId = `SR-${issueId.substring(0, 8)}`;
  } else {
    issueId = `SR-${Date.now().toString().substring(0, 8)}`;
  }
  
  card.innerHTML = `
    <div class="issue-header">
      <div class="issue-title-section">
        <h3>${getPriorityIcon(issue.priority)} ${issue.title || "Untitled Issue"}</h3>
        <span class="priority-badge priority-${priorityClass}">${issue.priority || "Medium"}</span>
        ${slaInfo}
      </div>
      <select class="status-select" data-issue-id="${issue.id}" onchange="handleStatusChange('${issue.id}', this.value)">
        <option value="Pending" ${issue.status === "Pending" ? "selected" : ""}>Pending</option>
        <option value="In Progress" ${issue.status === "In Progress" ? "selected" : ""}>In Progress</option>
        <option value="Resolved" ${issue.status === "Resolved" ? "selected" : ""}>Resolved</option>
      </select>
    </div>
    <div class="issue-id">Issue ID: #${issueId}</div>
    <p class="issue-description">${issue.description}</p>
    <div class="issue-meta">
      <span><strong>Category:</strong> ${issue.category}</span>
      <span><strong>Location:</strong> ${issue.location}</span>
      <span><strong>Reported by:</strong> ${issue.reportedBy}</span>
      <span><strong>Date:</strong> ${date}</span>
      ${timeAgo ? `<span><strong>Raised:</strong> ${timeAgo}</span>` : ""}
      ${affectedCount > 1 ? `<span class="affected-badge">👥 ${affectedCount} students affected</span>` : ""}
    </div>
    ${issue.imageUrl ? `<img src="${issue.imageUrl}" alt="Issue image" class="issue-image">` : ""}
    ${issue.visibility === "public" && !isResolved ? `
      <div class="me-too-section">
        <button class="btn-me-too ${issue.affectedUsers?.includes(currentUser?.uid) ? 'clicked' : ''}" 
                onclick="handleAdminMeToo('${issue.id}', ${issue.affectedUsers?.includes(currentUser?.uid) || false})" 
                ${issue.affectedUsers?.includes(currentUser?.uid) ? 'disabled' : ''}>
          ${issue.affectedUsers?.includes(currentUser?.uid) ? '✓ I face this too' : '👥 I face this too'}
        </button>
        <span class="affected-count">👥 ${affectedCount} ${affectedCount === 1 ? 'student' : 'students'} affected</span>
      </div>
    ` : ''}
    <div class="issue-actions">
      <a href="issue-detail.html?id=${issue.id}" class="btn-link">View Details & Timeline →</a>
    </div>
  `;
  
  return card;
}

// Helper functions
function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
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

// Handle status change - show resolution proof modal if resolving
async function handleStatusChange(issueId, newStatus) {
  if (newStatus === "Resolved") {
    // Show resolution proof modal
    showResolutionProofModal(issueId);
  } else {
    // For other status changes, update directly
    await updateIssueStatus(issueId, newStatus);
  }
}

// Show resolution proof modal
function showResolutionProofModal(issueId) {
  // Create modal if it doesn't exist
  let modal = document.getElementById("resolutionProofModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "resolutionProofModal";
    modal.className = "modal-overlay";
    modal.innerHTML = `
      <div class="modal-content">
        <h2>Mark Issue as Resolved</h2>
        <p>Please provide resolution proof (optional but recommended)</p>
        <form id="resolutionProofForm">
          <div class="form-group">
            <label for="resolutionNote">Resolution Note *</label>
            <textarea id="resolutionNote" required rows="3" placeholder="Brief description of how the issue was resolved..."></textarea>
          </div>
          <div class="form-group">
            <label for="resolutionImage">Resolution Proof Image (Optional)</label>
            <input type="file" id="resolutionImage" accept="image/*">
            <img id="resolutionImagePreview" style="display: none; max-width: 100%; margin-top: 10px; border-radius: 8px;">
          </div>
          <div id="resolutionError" class="error-message"></div>
          <div class="modal-buttons">
            <button type="submit" class="btn btn-primary">Mark as Resolved</button>
            <button type="button" class="btn btn-secondary" onclick="closeResolutionModal()">Cancel</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
    
    // Handle image preview
    document.getElementById("resolutionImage").addEventListener("change", function(e) {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
          document.getElementById("resolutionImagePreview").src = e.target.result;
          document.getElementById("resolutionImagePreview").style.display = "block";
        };
        reader.readAsDataURL(file);
      }
    });
    
    // Handle form submission
    document.getElementById("resolutionProofForm").addEventListener("submit", async function(e) {
      e.preventDefault();
      await submitResolutionProof(issueId);
    });
  }
  
  // Reset form
  document.getElementById("resolutionProofForm").reset();
  document.getElementById("resolutionImagePreview").style.display = "none";
  document.getElementById("resolutionError").textContent = "";
  modal.style.display = "flex";
  
  // Store issueId for form submission
  modal.dataset.issueId = issueId;
}

// Close resolution modal
function closeResolutionModal() {
  const modal = document.getElementById("resolutionProofModal");
  if (modal) {
    modal.style.display = "none";
  }
}

// Submit resolution proof
async function submitResolutionProof(issueId) {
  const errorMsg = document.getElementById("resolutionError");
  errorMsg.textContent = "";
  
  const note = document.getElementById("resolutionNote").value.trim();
  const imageFile = document.getElementById("resolutionImage").files[0];
  
  if (!note) {
    errorMsg.textContent = "Please provide a resolution note.";
    return;
  }
  
  try {
    let resolutionImageUrl = "";
    
    // Handle image upload
    if (imageFile) {
      try {
        const maxSize = 1024 * 1024; // 1MB
        if (imageFile.size > maxSize) {
          throw new Error("Image too large! Please use images smaller than 1MB.");
        }
        
        resolutionImageUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target.result);
          reader.onerror = reject;
          reader.readAsDataURL(imageFile);
        });
      } catch (error) {
        console.warn('Image upload failed:', error);
        if (error.message.includes('too large')) {
          errorMsg.textContent = error.message;
          return;
        }
      }
    }
    
    // Update issue status with resolution proof
    await updateIssueStatus(issueId, "Resolved", {
      resolutionNote: note,
      resolutionImageUrl: resolutionImageUrl,
      resolvedBy: currentUser.email
    });
    
    closeResolutionModal();
    
  } catch (error) {
    console.error("Error submitting resolution proof:", error);
    errorMsg.textContent = "Failed to submit. Please try again.";
  }
}

// Update issue status (global function for inline handlers)
async function updateIssueStatus(issueId, newStatus, resolutionData = {}) {
  try {
    // Get current issue to check previous status
    const issueDoc = await db.collection("issues").doc(issueId).get();
    if (!issueDoc.exists) {
      alert("Issue not found.");
      return;
    }
    
    const currentIssue = issueDoc.data();
    const previousStatus = currentIssue.status;
    
    const updateData = {
      status: newStatus
    };
    
    // If resolving, add resolved timestamp and verification window
    if (newStatus === "Resolved") {
      const now = new Date();
      const verificationDeadline = new Date(now.getTime() + 48 * 60 * 60 * 1000); // 48 hours
      
      if (firebase.firestore?.FieldValue?.serverTimestamp) {
        updateData.resolvedAt = firebase.firestore.FieldValue.serverTimestamp();
        updateData.verificationDeadline = firebase.firestore.Timestamp.fromDate(verificationDeadline);
      } else {
        // Demo mode
        updateData.resolvedAt = {
          toDate: () => now,
          seconds: Math.floor(now.getTime() / 1000)
        };
        updateData.verificationDeadline = {
          toDate: () => verificationDeadline,
          seconds: Math.floor(verificationDeadline.getTime() / 1000)
        };
      }
      
      // Add resolution proof data
      if (resolutionData.resolutionNote) {
        updateData.resolutionNote = resolutionData.resolutionNote;
      }
      if (resolutionData.resolutionImageUrl) {
        updateData.resolutionImageUrl = resolutionData.resolutionImageUrl;
      }
      if (resolutionData.resolvedBy) {
        updateData.resolvedBy = resolutionData.resolvedBy;
      }
      
      // Reset verification status
      updateData.verifiedResolved = false;
    }
    
    await db.collection("issues").doc(issueId).update(updateData);
    
    // Add timeline event
    const timelineMessages = {
      "Pending": "Issue status set to Pending",
      "In Progress": "Issue status changed to In Progress",
      "Resolved": resolutionData.resolutionNote ? 
        `Issue marked as Resolved. Note: ${resolutionData.resolutionNote}` : 
        "Issue marked as Resolved"
    };
    
    const timelineType = newStatus.toLowerCase().replace(" ", "_");
    
    try {
      await db.collection("issueTimeline").add({
        issueId: issueId,
        type: timelineType,
        message: timelineMessages[newStatus] || `Status changed to ${newStatus}`,
        user: currentUser.email,
        timestamp: firebase.firestore?.FieldValue?.serverTimestamp ? 
          firebase.firestore.FieldValue.serverTimestamp() : 
          { toDate: () => new Date() }
      });
    } catch (timelineError) {
      console.error("Error adding timeline event:", timelineError);
      // Continue even if timeline fails
    }
    
    // Reload issues
    const statusFilter = document.getElementById("statusFilter")?.value || "all";
    const categoryFilter = document.getElementById("categoryFilter")?.value || "all";
    const priorityFilter = document.getElementById("priorityFilter")?.value || "all";
    loadAllIssues(statusFilter, categoryFilter, priorityFilter);
    
  } catch (error) {
    console.error("Error updating status:", error);
    alert("Failed to update status. Please try again.");
  }
}

// Make function globally accessible
window.updateIssueStatus = updateIssueStatus;

// Update statistics
async function updateStats() {
  try {
    const snapshot = await db.collection("issues").get();
    
    let pending = 0, inProgress = 0, resolved = 0, total = 0;
    
    snapshot.forEach((doc) => {
      const issue = doc.data();
      total++;
      if (issue.status === "Pending") pending++;
      else if (issue.status === "In Progress") inProgress++;
      else if (issue.status === "Resolved") resolved++;
    });
    
    document.getElementById("statPending").textContent = pending;
    document.getElementById("statInProgress").textContent = inProgress;
    document.getElementById("statResolved").textContent = resolved;
    document.getElementById("statTotal").textContent = total;
    
  } catch (error) {
    console.error("Error updating stats:", error);
  }
}

// Filter handlers
document.addEventListener("DOMContentLoaded", function() {
  const statusFilter = document.getElementById("statusFilter");
  const categoryFilter = document.getElementById("categoryFilter");
  const priorityFilter = document.getElementById("priorityFilter");
  
  if (statusFilter) {
    statusFilter.addEventListener("change", function() {
      loadAllIssues(this.value, categoryFilter?.value || "all", priorityFilter?.value || "all");
    });
  }
  
  if (categoryFilter) {
    categoryFilter.addEventListener("change", function() {
      loadAllIssues(statusFilter?.value || "all", this.value, priorityFilter?.value || "all");
    });
  }
  
  if (priorityFilter) {
    priorityFilter.addEventListener("change", function() {
      loadAllIssues(statusFilter?.value || "all", categoryFilter?.value || "all", this.value);
    });
  }
});

// Logout function
function logout() {
  signOut().then(() => {
    window.location.href = "index.html";
  });
}

// Handle "Me Too" for admin
async function handleAdminMeToo(issueId, alreadyClicked) {
  if (alreadyClicked || !currentUser) {
    return;
  }

  const btn = event?.target?.closest('.btn-me-too') || event?.target;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Updating...';
  }
  
  try {
    const issueRef = db.collection("issues").doc(issueId);
    const issueDoc = await issueRef.get();
    
    if (!issueDoc.exists) {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '👥 I face this too';
      }
      return;
    }

    const issue = issueDoc.data();
    const affectedUsers = issue.affectedUsers || [];
    
    if (affectedUsers.includes(currentUser.uid)) {
      if (btn) {
        btn.classList.add('clicked');
        btn.disabled = true;
        btn.textContent = '✓ I face this too';
      }
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

    if (btn) {
      btn.classList.add('clicked');
      btn.disabled = true;
      btn.textContent = '✓ I face this too';
      const countSpan = btn.parentElement?.querySelector('.affected-count');
      if (countSpan) {
        countSpan.textContent = `👥 ${affectedUsers.length} ${affectedUsers.length === 1 ? 'student' : 'students'} affected`;
      }
    }

    // Reload issues
    const statusFilter = document.getElementById("statusFilter")?.value || "all";
    const categoryFilter = document.getElementById("categoryFilter")?.value || "all";
    const priorityFilter = document.getElementById("priorityFilter")?.value || "all";
    loadAllIssues(statusFilter, categoryFilter, priorityFilter);
    
  } catch (error) {
    console.error("Error handling Me Too:", error);
    if (btn) {
      btn.disabled = false;
      btn.textContent = '👥 I face this too';
    }
  }
}

// Make functions globally accessible
window.logout = logout;
window.handleAdminMeToo = handleAdminMeToo;
window.handleStatusChange = handleStatusChange;
window.closeResolutionModal = closeResolutionModal;
window.submitResolutionProof = submitResolutionProof;

