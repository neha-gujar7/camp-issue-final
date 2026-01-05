// Demo Mode - Works without Firebase using localStorage
// This allows the app to work immediately for demos

// Storage keys
const STORAGE_USERS = 'campus_h2s_users';
const STORAGE_ISSUES = 'campus_h2s_issues';
const STORAGE_CURRENT_USER = 'campus_h2s_current_user';
const STORAGE_TIMELINE = 'campus_h2s_timeline';
const STORAGE_ANNOUNCEMENTS = 'campus_h2s_announcements';

// Initialize demo storage
function initDemoStorage() {
  if (!localStorage.getItem(STORAGE_USERS)) {
    localStorage.setItem(STORAGE_USERS, JSON.stringify([]));
  }
  if (!localStorage.getItem(STORAGE_ISSUES)) {
    localStorage.setItem(STORAGE_ISSUES, JSON.stringify([]));
  }
  if (!localStorage.getItem(STORAGE_TIMELINE)) {
    localStorage.setItem(STORAGE_TIMELINE, JSON.stringify([]));
  }
  if (!localStorage.getItem(STORAGE_ANNOUNCEMENTS)) {
    localStorage.setItem(STORAGE_ANNOUNCEMENTS, JSON.stringify([]));
  }
}

// Normalize issue data (add missing fields for backward compatibility)
function normalizeIssue(issue) {
  const now = new Date();
  const timestamp = issue.timestamp ? new Date(issue.timestamp) : now;
  
  // Ensure createdAt exists
  if (!issue.createdAt) {
    issue.createdAt = {
      toDate: () => timestamp
    };
  } else if (typeof issue.createdAt === 'string') {
    issue.createdAt = {
      toDate: () => new Date(issue.createdAt)
    };
  }
  
  // Add default priority if missing
  if (!issue.priority) {
    issue.priority = "Medium";
  }
  
  // Add default affectedCount and affectedUsers if missing
  if (issue.affectedCount === undefined) {
    issue.affectedCount = 1;
  }
  if (!issue.affectedUsers) {
    issue.affectedUsers = issue.uid ? [issue.uid] : [];
  }
  
  // Add SLA fields if missing
  if (!issue.slaHours) {
    issue.slaHours = 24;
  }
  if (!issue.slaDeadline) {
    const deadline = new Date(timestamp.getTime() + issue.slaHours * 60 * 60 * 1000);
    issue.slaDeadline = {
      toDate: () => deadline,
      seconds: Math.floor(deadline.getTime() / 1000)
    };
  } else if (typeof issue.slaDeadline === 'string') {
    const deadline = new Date(issue.slaDeadline);
    issue.slaDeadline = {
      toDate: () => deadline,
      seconds: Math.floor(deadline.getTime() / 1000)
    };
  }
  
  // Ensure resolvedAt is null if not set
  if (issue.resolvedAt === undefined) {
    issue.resolvedAt = null;
  } else if (issue.resolvedAt && typeof issue.resolvedAt === 'string') {
    const resolvedDate = new Date(issue.resolvedAt);
    issue.resolvedAt = {
      toDate: () => resolvedDate,
      seconds: Math.floor(resolvedDate.getTime() / 1000)
    };
  }
  
  return issue;
}

// Demo Auth Service
const demoAuth = {
  currentUser: null,
  
  onAuthStateChanged(callback) {
    // Check for existing session
    const savedUser = localStorage.getItem(STORAGE_CURRENT_USER);
    if (savedUser) {
      this.currentUser = JSON.parse(savedUser);
      callback(this.currentUser);
    } else {
      callback(null);
    }
    
    // Listen for auth changes
    window.addEventListener('storage', () => {
      const user = localStorage.getItem(STORAGE_CURRENT_USER);
      this.currentUser = user ? JSON.parse(user) : null;
      callback(this.currentUser);
    });
    
    return () => {}; // Return unsubscribe function
  },
  
  async createUserWithEmailAndPassword(email, password) {
    initDemoStorage();
    const users = JSON.parse(localStorage.getItem(STORAGE_USERS));
    
    // Check if user exists
    if (users.find(u => u.email === email)) {
      throw { code: 'auth/email-already-in-use', message: 'Email already registered' };
    }
    
    // Create user
    const user = {
      uid: 'demo_' + Date.now(),
      email: email,
      emailVerified: false
    };
    
    users.push({ email, password, user });
    localStorage.setItem(STORAGE_USERS, JSON.stringify(users));
    
    // Auto login
    localStorage.setItem(STORAGE_CURRENT_USER, JSON.stringify(user));
    this.currentUser = user;
    
    return { user };
  },
  
  async signInWithEmailAndPassword(email, password) {
    initDemoStorage();
    const users = JSON.parse(localStorage.getItem(STORAGE_USERS));
    const userData = users.find(u => u.email === email);
    
    if (!userData) {
      throw { code: 'auth/user-not-found', message: 'User not found' };
    }
    
    if (userData.password !== password) {
      throw { code: 'auth/wrong-password', message: 'Wrong password' };
    }
    
    // Set current user
    localStorage.setItem(STORAGE_CURRENT_USER, JSON.stringify(userData.user));
    this.currentUser = userData.user;
    
    return { user: userData.user };
  },
  
  async signOut() {
    localStorage.removeItem(STORAGE_CURRENT_USER);
    this.currentUser = null;
    return Promise.resolve();
  }
};

// Demo Firestore Service
const demoDb = {
  collection(name) {
    const collectionName = name;
    return {
      async add(data) {
        initDemoStorage();
        const now = new Date();
        
        if (collectionName === "issues") {
          const issues = JSON.parse(localStorage.getItem(STORAGE_ISSUES));
          const newIssue = {
            id: 'issue_' + Date.now(),
            ...data,
            timestamp: now.toISOString(),
            createdAt: {
              toDate: () => now
            },
            // Handle new fields with defaults
            priority: data.priority || "Medium",
            affectedCount: data.affectedCount || 1,
            affectedUsers: data.affectedUsers || [],
            slaHours: data.slaHours || 24,
            slaDeadline: data.slaDeadline ? {
              toDate: () => new Date(data.slaDeadline.seconds * 1000)
            } : {
              toDate: () => new Date(now.getTime() + (data.slaHours || 24) * 60 * 60 * 1000)
            },
            resolvedAt: data.resolvedAt || null
          };
          issues.push(newIssue);
          localStorage.setItem(STORAGE_ISSUES, JSON.stringify(issues));
          return { id: newIssue.id };
        } else if (collectionName === "issueTimeline") {
          const timeline = JSON.parse(localStorage.getItem(STORAGE_TIMELINE));
          const newEvent = {
            id: 'timeline_' + Date.now(),
            ...data,
            timestamp: data.timestamp?.toDate ? data.timestamp.toDate() : now,
            createdAt: {
              toDate: () => now
            }
          };
          timeline.push(newEvent);
          localStorage.setItem(STORAGE_TIMELINE, JSON.stringify(timeline));
          return { id: newEvent.id };
        } else if (collectionName === "announcements") {
          const announcements = JSON.parse(localStorage.getItem(STORAGE_ANNOUNCEMENTS));
          const newAnnouncement = {
            id: 'announcement_' + Date.now(),
            ...data,
            timestamp: now.toISOString(),
            createdAt: {
              toDate: () => now
            }
          };
          announcements.push(newAnnouncement);
          localStorage.setItem(STORAGE_ANNOUNCEMENTS, JSON.stringify(announcements));
          return { id: newAnnouncement.id };
        }
        
        // Default fallback
        return { id: 'item_' + Date.now() };
      },
      
      async get() {
        initDemoStorage();
        
        if (collectionName === "issues") {
          let issues = JSON.parse(localStorage.getItem(STORAGE_ISSUES));
          // Normalize issues
          issues = issues.map(issue => normalizeIssue(issue));
          return {
            empty: issues.length === 0,
            forEach(callback) {
              issues.forEach(issue => {
                callback({
                  id: issue.id,
                  data: () => issue
                });
              });
            }
          };
        } else if (collectionName === "issueTimeline") {
          let timeline = JSON.parse(localStorage.getItem(STORAGE_TIMELINE));
          return {
            empty: timeline.length === 0,
            forEach(callback) {
              timeline.forEach(event => {
                callback({
                  id: event.id,
                  data: () => event
                });
              });
            }
          };
        } else if (collectionName === "announcements") {
          let announcements = JSON.parse(localStorage.getItem(STORAGE_ANNOUNCEMENTS));
          return {
            empty: announcements.length === 0,
            forEach(callback) {
              announcements.forEach(announcement => {
                callback({
                  id: announcement.id,
                  data: () => announcement
                });
              });
            }
          };
        }
        
        // Default fallback
        return {
          empty: true,
          forEach() {}
        };
      },
      
      doc(id) {
        return {
          async get() {
            initDemoStorage();
            
            if (collectionName === "issues") {
              const issues = JSON.parse(localStorage.getItem(STORAGE_ISSUES));
              const issue = issues.find(i => i.id === id);
              if (issue) {
                return {
                  exists: true,
                  data: () => normalizeIssue(issue)
                };
              }
            } else if (collectionName === "issueTimeline") {
              const timeline = JSON.parse(localStorage.getItem(STORAGE_TIMELINE));
              const event = timeline.find(e => e.id === id);
              if (event) {
                return {
                  exists: true,
                  data: () => event
                };
              }
            } else if (collectionName === "announcements") {
              const announcements = JSON.parse(localStorage.getItem(STORAGE_ANNOUNCEMENTS));
              const announcement = announcements.find(a => a.id === id);
              if (announcement) {
                return {
                  exists: true,
                  data: () => announcement
                };
              }
            }
            
            return { exists: false };
          },
          async update(data) {
            initDemoStorage();
            
            if (collectionName === "issues") {
              const issues = JSON.parse(localStorage.getItem(STORAGE_ISSUES));
              const index = issues.findIndex(i => i.id === id);
              if (index !== -1) {
                const updated = { ...issues[index], ...data };
                // Handle resolvedAt timestamp
                if (data.resolvedAt && typeof data.resolvedAt === 'object' && data.resolvedAt.seconds) {
                  updated.resolvedAt = {
                    toDate: () => new Date(data.resolvedAt.seconds * 1000)
                  };
                } else if (data.resolvedAt === null) {
                  updated.resolvedAt = null;
                }
                issues[index] = updated;
                localStorage.setItem(STORAGE_ISSUES, JSON.stringify(issues));
              }
            } else if (collectionName === "issueTimeline") {
              const timeline = JSON.parse(localStorage.getItem(STORAGE_TIMELINE));
              const index = timeline.findIndex(e => e.id === id);
              if (index !== -1) {
                timeline[index] = { ...timeline[index], ...data };
                localStorage.setItem(STORAGE_TIMELINE, JSON.stringify(timeline));
              }
            } else if (collectionName === "announcements") {
              const announcements = JSON.parse(localStorage.getItem(STORAGE_ANNOUNCEMENTS));
              const index = announcements.findIndex(a => a.id === id);
              if (index !== -1) {
                announcements[index] = { ...announcements[index], ...data };
                localStorage.setItem(STORAGE_ANNOUNCEMENTS, JSON.stringify(announcements));
              }
            }
          }
        };
      },
      
      where(field, operator, value) {
        return {
          orderBy(field2, direction) {
            return {
              async get() {
                initDemoStorage();
                
                let items = [];
                if (collectionName === "issues") {
                  items = JSON.parse(localStorage.getItem(STORAGE_ISSUES));
                } else if (collectionName === "issueTimeline") {
                  items = JSON.parse(localStorage.getItem(STORAGE_TIMELINE));
                } else if (collectionName === "announcements") {
                  items = JSON.parse(localStorage.getItem(STORAGE_ANNOUNCEMENTS));
                }
                
                // Apply where filter
                items = items.filter(item => item[field] === value);
                
                // Normalize issues if needed
                if (collectionName === "issues") {
                  items = items.map(item => normalizeIssue(item));
                }
                
                // Sort - handle timestamp objects
                items.sort((a, b) => {
                  let aVal = a[field2];
                  let bVal = b[field2];
                  
                  // Handle Firestore timestamp-like objects
                  if (aVal && typeof aVal === 'object' && aVal.toDate) {
                    aVal = aVal.toDate().getTime();
                  } else if (typeof aVal === 'string') {
                    aVal = new Date(aVal).getTime();
                  }
                  
                  if (bVal && typeof bVal === 'object' && bVal.toDate) {
                    bVal = bVal.toDate().getTime();
                  } else if (typeof bVal === 'string') {
                    bVal = new Date(bVal).getTime();
                  }
                  
                  if (direction === 'desc') {
                    return (bVal || 0) - (aVal || 0);
                  }
                  return (aVal || 0) - (bVal || 0);
                });
                
                return {
                  empty: items.length === 0,
                  forEach(callback) {
                    items.forEach(item => {
                      callback({
                        id: item.id,
                        data: () => item
                      });
                    });
                  }
                };
              }
            };
          }
        };
      },
      
      orderBy(field, direction) {
        return {
          async get() {
            initDemoStorage();
            
            let items = [];
            if (collectionName === "issues") {
              items = JSON.parse(localStorage.getItem(STORAGE_ISSUES));
              // Normalize issues
              items = items.map(item => normalizeIssue(item));
            } else if (collectionName === "issueTimeline") {
              items = JSON.parse(localStorage.getItem(STORAGE_TIMELINE));
            } else if (collectionName === "announcements") {
              items = JSON.parse(localStorage.getItem(STORAGE_ANNOUNCEMENTS));
            }
            
            // Sort - handle timestamp objects
            items.sort((a, b) => {
              let aVal = a[field];
              let bVal = b[field];
              
              // Handle Firestore timestamp-like objects
              if (aVal && typeof aVal === 'object' && aVal.toDate) {
                aVal = aVal.toDate().getTime();
              } else if (typeof aVal === 'string') {
                aVal = new Date(aVal).getTime();
              }
              
              if (bVal && typeof bVal === 'object' && bVal.toDate) {
                bVal = bVal.toDate().getTime();
              } else if (typeof bVal === 'string') {
                bVal = new Date(bVal).getTime();
              }
              
              if (direction === 'desc') {
                return (bVal || 0) - (aVal || 0);
              }
              return (aVal || 0) - (bVal || 0);
            });
            
            return {
              empty: items.length === 0,
              forEach(callback) {
                items.forEach(item => {
                  callback({
                    id: item.id,
                    data: () => item
                  });
                });
              }
            };
          }
        };
      }
    };
  }
};

// Demo Storage Service (for images)
const demoStorage = {
  ref(path) {
    return {
      async put(file) {
        // Convert file to base64 and return a ref-like object
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            // Store the base64 URL
            const base64Url = e.target.result;
            resolve({
              ref: {
                getDownloadURL: () => Promise.resolve(base64Url)
              }
            });
          };
          reader.readAsDataURL(file);
        });
      },
      
      async getDownloadURL() {
        // This will be handled in put()
        return Promise.resolve('');
      }
    };
  }
};

// Helper to convert base64 image URL from put() result
async function handleImageUpload(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      resolve(e.target.result); // Return base64 data URL
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

