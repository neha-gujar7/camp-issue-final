// Issue Detail Page with Timeline

let currentUser = null;
let currentIssue = null;
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

  // Get issue ID from URL
  const urlParams = new URLSearchParams(window.location.search);
  const issueId = urlParams.get('id');

  if (issueId) {
    loadIssueDetails(issueId);
  } else {
    document.getElementById("issueDetails").innerHTML = "<p class='error-message'>No issue ID provided.</p>";
  }
});

// Load issue details
async function loadIssueDetails(issueId) {
  try {
    const issueDoc = await db.collection("issues").doc(issueId).get();
    
    if (!issueDoc.exists) {
      document.getElementById("issueDetails").innerHTML = "<p class='error-message'>Issue not found.</p>";
      return;
    }

    currentIssue = { id: issueDoc.id, ...issueDoc.data() };
    displayIssueDetails(currentIssue);
    loadIssueTimeline(issueId);
    
    // Check verification window and auto-verify if expired
    if (currentIssue.status === "Resolved" && !currentIssue.verifiedResolved) {
      await checkVerificationWindow(currentIssue);
    }
    
    // Show re-open section if issue is resolved and user is the reporter
    if (currentIssue.status === "Resolved" && currentIssue.uid === currentUser.uid && !currentIssue.verifiedResolved) {
      const reopenSection = document.getElementById("reopenSection");
      reopenSection.style.display = "block";
      
      // Show verification deadline info
      if (currentIssue.verificationDeadline) {
        const deadline = currentIssue.verificationDeadline.toDate ? 
          currentIssue.verificationDeadline.toDate() : 
          new Date(currentIssue.verificationDeadline);
        const now = new Date();
        const timeLeft = deadline - now;
        const hoursLeft = Math.floor(timeLeft / (1000 * 60 * 60));
        
        const deadlineInfo = document.getElementById("verificationDeadlineInfo");
        if (timeLeft > 0) {
          deadlineInfo.innerHTML = `⏰ You have <strong>${hoursLeft} hours</strong> to verify this resolution. After that, it will be auto-verified.`;
        } else {
          deadlineInfo.innerHTML = `⏰ Verification window expired. Issue will be auto-verified.`;
        }
      }
    }
    
    // Show resolution proof if available
    if (currentIssue.resolutionNote || currentIssue.resolutionImageUrl) {
      const proofSection = document.getElementById("resolutionProofSection");
      proofSection.style.display = "block";
      
      let proofContent = "";
      if (currentIssue.resolutionNote) {
        proofContent += `<p><strong>Resolution Note:</strong> ${currentIssue.resolutionNote}</p>`;
      }
      if (currentIssue.resolutionImageUrl) {
        proofContent += `<img src="${currentIssue.resolutionImageUrl}" alt="Resolution proof" class="issue-image" style="max-width: 500px; margin-top: 10px;">`;
      }
      if (currentIssue.resolvedBy) {
        proofContent += `<p style="margin-top: 10px; font-size: 12px; color: #666;">Resolved by: ${currentIssue.resolvedBy}</p>`;
      }
      
      document.getElementById("resolutionProofContent").innerHTML = proofContent;
    }
  } catch (error) {
    console.error("Error loading issue:", error);
    document.getElementById("issueDetails").innerHTML = "<p class='error-message'>Error loading issue.</p>";
  }
}

// Display issue details
function displayIssueDetails(issue) {
  const container = document.getElementById("issueDetails");
  const priorityClass = (issue.priority || "Medium").toLowerCase();
  const statusClass = issue.status.toLowerCase().replace(" ", "-");
  
  let date = "N/A";
  try {
    let issueDate;
    if (issue.createdAt?.toDate) {
      issueDate = issue.createdAt.toDate();
    } else if (issue.timestamp) {
      issueDate = new Date(issue.timestamp);
    }
    if (issueDate && !isNaN(issueDate.getTime())) {
      date = issueDate.toLocaleDateString();
    }
  } catch (e) {}

  const issueId = issue.id.startsWith('issue_') ? `SR-${issue.id.replace('issue_', '').substring(0, 8)}` : `SR-${issue.id.substring(0, 8)}`;

  container.innerHTML = `
    <div class="issue-header">
      <div class="issue-title-section">
        <h2>${getPriorityIcon(issue.priority)} ${issue.title || "Untitled Issue"}</h2>
        <span class="priority-badge priority-${priorityClass}">${issue.priority || "Medium"}</span>
        <span class="status-badge status-${statusClass}">${issue.status}</span>
      </div>
    </div>
    <div class="issue-id">Issue ID: #${issueId}</div>
    <p class="issue-description">${issue.description}</p>
    <div class="issue-meta">
      <span><strong>Category:</strong> ${issue.category}</span>
      <span><strong>Location:</strong> ${issue.location}</span>
      <span><strong>Reported by:</strong> ${issue.reportedBy}</span>
      <span><strong>Date:</strong> ${date}</span>
      ${issue.affectedCount > 1 ? `<span class="affected-badge">👥 ${issue.affectedCount} students affected</span>` : ""}
    </div>
    ${issue.imageUrl ? `<img src="${issue.imageUrl}" alt="Issue image" class="issue-image">` : ""}
  `;

  document.getElementById("issueIdDisplay").textContent = `Issue #${issueId}`;
}

// Load issue timeline
async function loadIssueTimeline(issueId) {
  const container = document.getElementById("issueTimeline");
  
  try {
    // Get timeline events
    const timelineSnapshot = await db.collection("issueTimeline")
      .where("issueId", "==", issueId)
      .orderBy("timestamp", "asc")
      .get();

    let timelineEvents = [];
    
    timelineSnapshot.forEach(doc => {
      timelineEvents.push({ id: doc.id, ...doc.data() });
    });

    // If no timeline events, create initial event from issue
    if (timelineEvents.length === 0 && currentIssue) {
      timelineEvents.push({
        type: "reported",
        message: "Issue reported",
        user: currentIssue.reportedBy,
        timestamp: currentIssue.createdAt || { toDate: () => new Date() }
      });
    }

    // Sort by timestamp
    timelineEvents.sort((a, b) => {
      const aTime = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : 
                   (a.timestamp ? new Date(a.timestamp).getTime() : 0);
      const bTime = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : 
                   (b.timestamp ? new Date(b.timestamp).getTime() : 0);
      return aTime - bTime;
    });

    container.innerHTML = "";
    
    if (timelineEvents.length === 0) {
      container.innerHTML = "<p>No timeline events yet.</p>";
      return;
    }

    timelineEvents.forEach(event => {
      container.appendChild(createTimelineEvent(event));
    });
  } catch (error) {
    console.error("Error loading timeline:", error);
    // Try without orderBy
    try {
      const timelineSnapshot = await db.collection("issueTimeline")
        .where("issueId", "==", issueId)
        .get();

      let timelineEvents = [];
      timelineSnapshot.forEach(doc => {
        timelineEvents.push({ id: doc.id, ...doc.data() });
      });

      timelineEvents.sort((a, b) => {
        const aTime = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : 
                     (a.timestamp ? new Date(a.timestamp).getTime() : 0);
        const bTime = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : 
                     (b.timestamp ? new Date(b.timestamp).getTime() : 0);
        return aTime - bTime;
      });

      container.innerHTML = "";
      timelineEvents.forEach(event => {
        container.appendChild(createTimelineEvent(event));
      });
    } catch (e) {
      container.innerHTML = "<p class='error-message'>Error loading timeline.</p>";
    }
  }
}

// Create timeline event
function createTimelineEvent(event) {
  const item = document.createElement("div");
  item.className = `timeline-event timeline-${event.type}`;

  let dateStr = "N/A";
  let timeStr = "";
  
  try {
    let eventDate;
    if (event.timestamp?.toDate) {
      eventDate = event.timestamp.toDate();
    } else if (event.timestamp) {
      eventDate = new Date(event.timestamp);
    }
    
    if (eventDate && !isNaN(eventDate.getTime())) {
      dateStr = eventDate.toLocaleDateString();
      timeStr = eventDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
  } catch (e) {}

  const icons = {
    "reported": "🟢",
    "assigned": "🟡",
    "in_progress": "🟠",
    "resolved": "🔵",
    "reopened": "🔴",
    "verified": "✅",
    "comment": "💬"
  };

  item.innerHTML = `
    <div class="timeline-icon">${icons[event.type] || "•"}</div>
    <div class="timeline-content">
      <div class="timeline-message">${event.message || event.type}</div>
      <div class="timeline-meta">
        <span>${event.user || "System"}</span>
        <span>${dateStr} ${timeStr}</span>
      </div>
    </div>
  `;

  return item;
}

// Check verification window and auto-verify if expired
async function checkVerificationWindow(issue) {
  if (!issue.verificationDeadline || issue.verifiedResolved) return;
  
  try {
    const deadline = issue.verificationDeadline.toDate ? 
      issue.verificationDeadline.toDate() : 
      new Date(issue.verificationDeadline);
    const now = new Date();
    
    // If deadline passed, auto-verify
    if (now > deadline) {
      await db.collection("issues").doc(issue.id).update({
        verifiedResolved: true
      });
      
      // Add timeline event
      await db.collection("issueTimeline").add({
        issueId: issue.id,
        type: "verified",
        message: "Issue auto-verified (verification window expired)",
        user: "System",
        timestamp: firebase.firestore?.FieldValue?.serverTimestamp ? 
          firebase.firestore.FieldValue.serverTimestamp() : 
          { toDate: () => new Date() }
      });
      
      // Reload if this is the current issue
      if (currentIssue && currentIssue.id === issue.id) {
        loadIssueDetails(issue.id);
      }
    }
  } catch (error) {
    console.error("Error checking verification window:", error);
  }
}

// Show reopen modal with reason
function showReopenModal() {
  // Create modal if it doesn't exist
  let modal = document.getElementById("reopenModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "reopenModal";
    modal.className = "modal-overlay";
    modal.innerHTML = `
      <div class="modal-content">
        <h2>Reopen Issue</h2>
        <p>Please provide a reason for reopening this issue.</p>
        <form id="reopenForm">
          <div class="form-group">
            <label for="reopenReasonCategory">Reason Category *</label>
            <select id="reopenReasonCategory" required>
              <option value="">Select a reason</option>
              <option value="Issue Not Fixed">Issue Not Fixed</option>
              <option value="Partial Fix Only">Partial Fix Only</option>
              <option value="New Problem Appeared">New Problem Appeared</option>
              <option value="Wrong Issue Resolved">Wrong Issue Resolved</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div class="form-group">
            <label for="reopenReasonText">Detailed Reason *</label>
            <textarea id="reopenReasonText" required rows="4" placeholder="Please explain why the issue needs to be reopened..."></textarea>
          </div>
          <div id="reopenError" class="error-message"></div>
          <div class="modal-buttons">
            <button type="submit" class="btn btn-danger">Reopen Issue</button>
            <button type="button" class="btn btn-secondary" onclick="closeReopenModal()">Cancel</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
    
    // Handle form submission
    document.getElementById("reopenForm").addEventListener("submit", async function(e) {
      e.preventDefault();
      await submitReopen();
    });
  }
  
  // Reset form
  document.getElementById("reopenForm").reset();
  document.getElementById("reopenError").textContent = "";
  modal.style.display = "flex";
}

// Close reopen modal
function closeReopenModal() {
  const modal = document.getElementById("reopenModal");
  if (modal) {
    modal.style.display = "none";
  }
}

// Submit reopen with reason
async function submitReopen() {
  if (!currentIssue) return;
  
  const errorMsg = document.getElementById("reopenError");
  errorMsg.textContent = "";
  
  const reasonCategory = document.getElementById("reopenReasonCategory").value;
  const reasonText = document.getElementById("reopenReasonText").value.trim();
  
  if (!reasonCategory || !reasonText) {
    errorMsg.textContent = "Please fill in all required fields.";
    return;
  }
  
  try {
    // Get current priority and increase it
    let newPriority = currentIssue.priority || "Medium";
    const priorityOrder = { "Low": 1, "Medium": 2, "High": 3, "Critical": 4 };
    const currentPriorityLevel = priorityOrder[newPriority] || 2;
    
    // Increase priority by one level (max Critical)
    if (currentPriorityLevel < 4) {
      const priorityNames = ["Low", "Medium", "High", "Critical"];
      newPriority = priorityNames[currentPriorityLevel];
    }
    
    // Re-open issue with increased priority and clear 48-hour timer
    const updateData = {
      status: "In Progress",
      verifiedResolved: false,
      priority: newPriority,
      reopenReason: {
        category: reasonCategory,
        text: reasonText,
        reopenedAt: firebase.firestore?.FieldValue?.serverTimestamp ? 
          firebase.firestore.FieldValue.serverTimestamp() : 
          { toDate: () => new Date() },
        reopenedBy: currentUser.email
      }
    };
    
    // Clear 48-hour timer by deleting verificationDeadline and resolvedAt fields
    if (firebase.firestore?.FieldValue?.delete) {
      // Real Firestore mode - use FieldValue.delete() to properly remove fields
      updateData.resolvedAt = firebase.firestore.FieldValue.delete();
      updateData.verificationDeadline = firebase.firestore.FieldValue.delete();
    } else {
      // Demo mode - set to null
      updateData.resolvedAt = null;
      updateData.verificationDeadline = null;
    }
    
    await db.collection("issues").doc(currentIssue.id).update(updateData);

    // Add timeline event
    await db.collection("issueTimeline").add({
      issueId: currentIssue.id,
      type: "reopened",
      message: `Issue reopened: ${reasonCategory} - ${reasonText}`,
      user: currentUser.email,
      timestamp: firebase.firestore?.FieldValue?.serverTimestamp ? 
        firebase.firestore.FieldValue.serverTimestamp() : 
        { toDate: () => new Date() }
    });

    closeReopenModal();
    alert("Issue has been reopened with increased priority. Admin will be notified.");
    document.getElementById("reopenSection").style.display = "none";

    // Reload issue
    loadIssueDetails(currentIssue.id);
  } catch (error) {
    console.error("Error reopening issue:", error);
    errorMsg.textContent = "Failed to reopen issue. Please try again.";
  }
}

// Verify resolution (re-open feature)
async function verifyResolution(isResolved) {
  if (!currentIssue) return;

  try {
    if (isResolved) {
      // Mark as verified resolved
      await db.collection("issues").doc(currentIssue.id).update({
        verifiedResolved: true
      });

      // Add timeline event
      await db.collection("issueTimeline").add({
        issueId: currentIssue.id,
        type: "verified",
        message: "Issue verified as resolved by reporter",
        user: currentUser.email,
        timestamp: firebase.firestore?.FieldValue?.serverTimestamp ? 
          firebase.firestore.FieldValue.serverTimestamp() : 
          { toDate: () => new Date() }
      });

      alert("Thank you for confirming! Issue marked as resolved.");
      document.getElementById("reopenSection").style.display = "none";
    }

    // Reload issue
    loadIssueDetails(currentIssue.id);
  } catch (error) {
    console.error("Error verifying resolution:", error);
    alert("Failed to update. Please try again.");
  }
}

// Helper functions
function getPriorityIcon(priority) {
  const icons = {
    "Critical": "🔴",
    "High": "🟠",
    "Medium": "🟡",
    "Low": "🟢"
  };
  return icons[priority] || "🟡";
}

// Logout
function logout() {
  signOut().then(() => {
    window.location.href = "index.html";
  });
}

window.logout = logout;
window.verifyResolution = verifyResolution;
window.showReopenModal = showReopenModal;
window.closeReopenModal = closeReopenModal;
window.submitReopen = submitReopen;

