/**
 * DenizRota - Firebase Configuration
 * Firebase Authentication ve Firestore veritabanı yapılandırması
 *
 * KURULUM:
 * 1. Firebase Console'da yeni proje oluşturun: https://console.firebase.google.com
 * 2. Authentication > Sign-in method'dan Email/Password ve Google'ı etkinleştirin
 * 3. Firestore Database oluşturun (test modunda başlayabilirsiniz)
 * 4. Project Settings > General'dan Firebase SDK config'i alın
 * 5. Aşağıdaki firebaseConfig değerlerini kendi projenizinkilerle değiştirin
 */

// Firebase yapılandırması
const firebaseConfig = {
    apiKey: "AIzaSyDm3v5OZhF5Y9UtsYZCG9-YuUPZcO3_0Vc",
    authDomain: "denizrota-d40d1.firebaseapp.com",
    projectId: "denizrota-d40d1",
    storageBucket: "denizrota-d40d1.firebasestorage.app",
    messagingSenderId: "317659078558",
    appId: "1:317659078558:web:452891336d6b59d09f008f"
};

// Firebase başlatma durumu
let firebaseInitialized = false;
let auth = null;
let db = null;

// Firebase'in yüklenip yüklenmediğini kontrol et
function isFirebaseConfigured() {
    return firebaseConfig.apiKey !== "YOUR_API_KEY" &&
           firebaseConfig.projectId !== "YOUR_PROJECT_ID";
}

// Firebase'i başlat
function initializeFirebase() {
    if (firebaseInitialized) return true;

    if (!isFirebaseConfigured()) {
        console.warn('Firebase yapılandırılmamış. firebase-config.js dosyasını düzenleyin.');
        return false;
    }

    try {
        // Firebase uygulamasını başlat
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }

        auth = firebase.auth();
        db = firebase.firestore();

        // Türkçe dil desteği
        auth.languageCode = 'tr';

        // Auth state listener
        auth.onAuthStateChanged(handleAuthStateChange);

        firebaseInitialized = true;
        console.log('Firebase başarıyla başlatıldı! 🔥');
        return true;
    } catch (error) {
        console.error('Firebase başlatma hatası:', error);
        return false;
    }
}

// ===== Authentication Functions =====

// Mevcut kullanıcı
let currentUser = null;

// Auth durumu değişiklik handler
function handleAuthStateChange(user) {
    currentUser = user;
    updateAuthUI(user);

    if (user) {
        console.log('Kullanıcı giriş yaptı:', user.email);
        // Kullanıcı verilerini yükle
        loadUserData();
    } else {
        console.log('Kullanıcı çıkış yaptı');
        // LocalStorage'a geri dön
        loadLocalData();
    }
}

// Email/Password ile kayıt ol
async function signUpWithEmail(email, password, displayName) {
    if (!auth) {
        showAuthError('Firebase yapılandırılmamış');
        return null;
    }

    try {
        const result = await auth.createUserWithEmailAndPassword(email, password);

        // Kullanıcı adını güncelle
        if (displayName) {
            await result.user.updateProfile({ displayName });
        }

        // Firestore'da kullanıcı dokümanı oluştur
        await createUserDocument(result.user);

        return result.user;
    } catch (error) {
        handleAuthError(error);
        return null;
    }
}

// Email/Password ile giriş yap
async function signInWithEmail(email, password) {
    if (!auth) {
        showAuthError('Firebase yapılandırılmamış');
        return null;
    }

    try {
        const result = await auth.signInWithEmailAndPassword(email, password);
        return result.user;
    } catch (error) {
        handleAuthError(error);
        return null;
    }
}

// Google ile giriş yap
async function signInWithGoogle() {
    if (!auth) {
        showAuthError('Firebase yapılandırılmamış');
        return null;
    }

    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.addScope('profile');
        provider.addScope('email');

        const result = await auth.signInWithPopup(provider);

        // İlk girişse kullanıcı dokümanı oluştur
        const userDoc = await db.collection('users').doc(result.user.uid).get();
        if (!userDoc.exists) {
            await createUserDocument(result.user);
        }

        return result.user;
    } catch (error) {
        handleAuthError(error);
        return null;
    }
}

// Çıkış yap
async function signOut() {
    if (!auth) return;

    try {
        await auth.signOut();
    } catch (error) {
        console.error('Çıkış hatası:', error);
    }
}

// Şifre sıfırlama emaili gönder
async function sendPasswordReset(email) {
    if (!auth) {
        showAuthError('Firebase yapılandırılmamış');
        return false;
    }

    try {
        await auth.sendPasswordResetEmail(email);
        showAuthSuccess('Şifre sıfırlama bağlantısı email adresinize gönderildi.');
        return true;
    } catch (error) {
        handleAuthError(error);
        return false;
    }
}

// Firestore'da kullanıcı dokümanı oluştur
async function createUserDocument(user) {
    if (!db) return;

    const userRef = db.collection('users').doc(user.uid);

    const userData = {
        email: user.email,
        displayName: user.displayName || '',
        photoURL: user.photoURL || '',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastLogin: firebase.firestore.FieldValue.serverTimestamp()
    };

    await userRef.set(userData, { merge: true });
}

// Auth hatalarını işle
function handleAuthError(error) {
    let message = 'Bir hata oluştu';

    switch (error.code) {
        case 'auth/email-already-in-use':
            message = 'Bu email adresi zaten kullanılıyor';
            break;
        case 'auth/invalid-email':
            message = 'Geçersiz email adresi';
            break;
        case 'auth/operation-not-allowed':
            message = 'Bu giriş yöntemi etkin değil';
            break;
        case 'auth/weak-password':
            message = 'Şifre çok zayıf (en az 6 karakter)';
            break;
        case 'auth/user-disabled':
            message = 'Bu hesap devre dışı bırakılmış';
            break;
        case 'auth/user-not-found':
            message = 'Bu email ile kayıtlı kullanıcı bulunamadı';
            break;
        case 'auth/wrong-password':
            message = 'Yanlış şifre';
            break;
        case 'auth/popup-closed-by-user':
            message = 'Giriş penceresi kapatıldı';
            break;
        case 'auth/network-request-failed':
            message = 'Ağ bağlantısı hatası';
            break;
        case 'auth/too-many-requests':
            message = 'Çok fazla deneme. Lütfen daha sonra tekrar deneyin';
            break;
        default:
            message = error.message;
    }

    showAuthError(message);
    console.error('Auth hatası:', error);
}

// Hata mesajı göster
function showAuthError(message) {
    const errorEl = document.getElementById('authError');
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
        setTimeout(() => errorEl.classList.add('hidden'), 5000);
    } else {
        alert(message);
    }
}

// Başarı mesajı göster
function showAuthSuccess(message) {
    const successEl = document.getElementById('authSuccess');
    if (successEl) {
        successEl.textContent = message;
        successEl.classList.remove('hidden');
        setTimeout(() => successEl.classList.add('hidden'), 5000);
    } else {
        alert(message);
    }
}

// ===== Firestore Database Functions =====

// Kullanıcı verilerini yükle (giriş yapıldığında)
async function loadUserData() {
    if (!currentUser || !db) return;

    try {
        // Ayarları yükle
        await loadSettingsFromFirestore();

        // Yolculukları yükle
        await loadTripsFromFirestore();

        // Kayıtlı rotaları yükle
        await loadRoutesFromFirestore();

    } catch (error) {
        console.error('Kullanıcı verileri yüklenemedi:', error);
    }
}

// LocalStorage verilerini yükle (çıkış yapıldığında)
function loadLocalData() {
    // app.js'deki loadSettings() ve getTripHistory() fonksiyonlarını kullan
    if (typeof loadSettings === 'function') {
        loadSettings();
    }
    if (typeof updateSidebarTripsList === 'function') {
        updateSidebarTripsList();
    }
    if (typeof updateSavedRoutesList === 'function') {
        updateSavedRoutesList();
    }
}

// ===== Settings =====

// Ayarları Firestore'a kaydet
async function saveSettingsToFirestore(settings) {
    if (!currentUser || !db) {
        // Giriş yapılmamışsa LocalStorage'a kaydet
        localStorage.setItem('denizRotaSettings', JSON.stringify(settings));
        return;
    }

    try {
        await db.collection('users').doc(currentUser.uid).update({
            settings: settings,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        console.log('Ayarlar Firebase\'e kaydedildi');
    } catch (error) {
        console.error('Ayarlar kaydedilemedi:', error);
        // Fallback: LocalStorage'a kaydet
        localStorage.setItem('denizRotaSettings', JSON.stringify(settings));
    }
}

// Ayarları Firestore'dan yükle
async function loadSettingsFromFirestore() {
    if (!currentUser || !db) return null;

    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();

        if (userDoc.exists && userDoc.data().settings) {
            const settings = userDoc.data().settings;

            // Global state'i güncelle
            if (typeof state !== 'undefined') {
                state.settings = { ...state.settings, ...settings };
            }

            // Form alanlarını güncelle
            if (typeof loadSettingsToForm === 'function') {
                loadSettingsToForm();
            }

            return settings;
        }
    } catch (error) {
        console.error('Ayarlar yüklenemedi:', error);
    }

    return null;
}

// ===== Trips (Yolculuklar) =====

// Yolculuğu Firestore'a kaydet
async function saveTripToFirestore(trip) {
    if (!currentUser || !db) {
        // Giriş yapılmamışsa LocalStorage'a kaydet
        let trips = JSON.parse(localStorage.getItem('denizRotaTrips') || '[]');
        trips.unshift(trip);
        if (trips.length > 50) trips = trips.slice(0, 50);
        localStorage.setItem('denizRotaTrips', JSON.stringify(trips));
        return;
    }

    try {
        await db.collection('users').doc(currentUser.uid)
            .collection('trips').doc(trip.id.toString()).set({
                ...trip,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        console.log('Yolculuk Firebase\'e kaydedildi');
    } catch (error) {
        console.error('Yolculuk kaydedilemedi:', error);
        // Fallback
        let trips = JSON.parse(localStorage.getItem('denizRotaTrips') || '[]');
        trips.unshift(trip);
        localStorage.setItem('denizRotaTrips', JSON.stringify(trips));
    }
}

// Yolculukları Firestore'dan yükle
async function loadTripsFromFirestore() {
    if (!currentUser || !db) return [];

    try {
        const snapshot = await db.collection('users').doc(currentUser.uid)
            .collection('trips')
            .orderBy('createdAt', 'desc')
            .limit(50)
            .get();

        const trips = [];
        snapshot.forEach(doc => {
            trips.push({ id: doc.id, ...doc.data() });
        });

        // Sidebar'ı güncelle
        if (typeof updateSidebarTripsList === 'function') {
            // Geçici olarak local listeyi güncelle
            window._firestoreTrips = trips;
            updateSidebarTripsList();
        }

        return trips;
    } catch (error) {
        console.error('Yolculuklar yüklenemedi:', error);
        return [];
    }
}

// Yolculuğu Firestore'dan sil
async function deleteTripFromFirestore(tripId) {
    if (!currentUser || !db) {
        // LocalStorage'dan sil
        let trips = JSON.parse(localStorage.getItem('denizRotaTrips') || '[]');
        trips = trips.filter(t => t.id.toString() !== tripId.toString());
        localStorage.setItem('denizRotaTrips', JSON.stringify(trips));
        return;
    }

    try {
        await db.collection('users').doc(currentUser.uid)
            .collection('trips').doc(tripId.toString()).delete();
        console.log('Yolculuk silindi');
    } catch (error) {
        console.error('Yolculuk silinemedi:', error);
    }
}

// Tüm yolculukları Firestore'dan sil
async function clearTripsFromFirestore() {
    if (!currentUser || !db) {
        localStorage.removeItem('denizRotaTrips');
        return;
    }

    try {
        const snapshot = await db.collection('users').doc(currentUser.uid)
            .collection('trips').get();

        const batch = db.batch();
        snapshot.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();

        console.log('Tüm yolculuklar silindi');
    } catch (error) {
        console.error('Yolculuklar silinemedi:', error);
    }
}

// ===== Routes (Kayıtlı Rotalar) =====

// Rotayı Firestore'a kaydet
async function saveRouteToFirestore(route) {
    if (!currentUser || !db) {
        // Giriş yapılmamışsa LocalStorage'a kaydet
        let routes = JSON.parse(localStorage.getItem('denizRotaRoutes') || '[]');
        routes.unshift(route);
        if (routes.length > 50) routes = routes.slice(0, 50);
        localStorage.setItem('denizRotaRoutes', JSON.stringify(routes));
        return route.id;
    }

    try {
        const docRef = await db.collection('users').doc(currentUser.uid)
            .collection('routes').add({
                ...route,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        console.log('Rota Firebase\'e kaydedildi:', docRef.id);
        return docRef.id;
    } catch (error) {
        console.error('Rota kaydedilemedi:', error);
        // Fallback
        let routes = JSON.parse(localStorage.getItem('denizRotaRoutes') || '[]');
        routes.unshift(route);
        localStorage.setItem('denizRotaRoutes', JSON.stringify(routes));
        return route.id;
    }
}

// Rotaları Firestore'dan yükle
async function loadRoutesFromFirestore() {
    if (!currentUser || !db) return [];

    try {
        const snapshot = await db.collection('users').doc(currentUser.uid)
            .collection('routes')
            .orderBy('createdAt', 'desc')
            .limit(50)
            .get();

        const routes = [];
        snapshot.forEach(doc => {
            routes.push({ id: doc.id, ...doc.data() });
        });

        // Sidebar'ı güncelle
        window._firestoreRoutes = routes;
        if (typeof updateSavedRoutesList === 'function') {
            updateSavedRoutesList();
        }

        return routes;
    } catch (error) {
        console.error('Rotalar yüklenemedi:', error);
        return [];
    }
}

// Rotayı Firestore'dan sil
async function deleteRouteFromFirestore(routeId) {
    if (!currentUser || !db) {
        let routes = JSON.parse(localStorage.getItem('denizRotaRoutes') || '[]');
        routes = routes.filter(r => r.id !== routeId);
        localStorage.setItem('denizRotaRoutes', JSON.stringify(routes));
        return;
    }

    try {
        await db.collection('users').doc(currentUser.uid)
            .collection('routes').doc(routeId).delete();
        console.log('Rota silindi');
    } catch (error) {
        console.error('Rota silinemedi:', error);
    }
}

// Rotayı güncelle
async function updateRouteInFirestore(routeId, updates) {
    if (!currentUser || !db) {
        let routes = JSON.parse(localStorage.getItem('denizRotaRoutes') || '[]');
        const index = routes.findIndex(r => r.id === routeId);
        if (index !== -1) {
            routes[index] = { ...routes[index], ...updates };
            localStorage.setItem('denizRotaRoutes', JSON.stringify(routes));
        }
        return;
    }

    try {
        await db.collection('users').doc(currentUser.uid)
            .collection('routes').doc(routeId).update({
                ...updates,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        console.log('Rota güncellendi');
    } catch (error) {
        console.error('Rota güncellenemedi:', error);
    }
}

// ===== UI Update Functions =====

// Auth UI'ı güncelle
function updateAuthUI(user) {
    const loginBtn = document.getElementById('loginBtn');
    const userInfo = document.getElementById('userInfo');
    const userAvatar = document.getElementById('userAvatar');
    const userName = document.getElementById('userName');
    const authModal = document.getElementById('authModal');

    if (user) {
        // Giriş yapılmış
        if (loginBtn) loginBtn.classList.add('hidden');
        if (userInfo) userInfo.classList.remove('hidden');

        if (userAvatar) {
            if (user.photoURL) {
                userAvatar.innerHTML = `<img src="${user.photoURL}" alt="Avatar" />`;
            } else {
                const initial = (user.displayName || user.email || 'U')[0].toUpperCase();
                userAvatar.innerHTML = `<span>${initial}</span>`;
            }
        }

        if (userName) {
            userName.textContent = user.displayName || user.email.split('@')[0];
        }

        // Modal açıksa kapat
        if (authModal) authModal.classList.add('hidden');

    } else {
        // Çıkış yapılmış
        if (loginBtn) loginBtn.classList.remove('hidden');
        if (userInfo) userInfo.classList.add('hidden');
    }
}

// ===== Data Migration =====

// LocalStorage verilerini Firestore'a taşı
async function migrateLocalDataToFirestore() {
    if (!currentUser || !db) return;

    try {
        // Ayarları taşı
        const localSettings = localStorage.getItem('denizRotaSettings');
        if (localSettings) {
            const settings = JSON.parse(localSettings);
            await saveSettingsToFirestore(settings);
        }

        // Yolculukları taşı
        const localTrips = localStorage.getItem('denizRotaTrips');
        if (localTrips) {
            const trips = JSON.parse(localTrips);
            for (const trip of trips) {
                await saveTripToFirestore(trip);
            }
        }

        // Rotaları taşı
        const localRoutes = localStorage.getItem('denizRotaRoutes');
        if (localRoutes) {
            const routes = JSON.parse(localRoutes);
            for (const route of routes) {
                await saveRouteToFirestore(route);
            }
        }

        console.log('Veriler Firebase\'e taşındı! ✅');

        // Kullanıcıya sor: LocalStorage verilerini silmek ister misiniz?
        if (confirm('Mevcut verileriniz buluta aktarıldı. Yerel kopyaları silmek ister misiniz?')) {
            localStorage.removeItem('denizRotaSettings');
            localStorage.removeItem('denizRotaTrips');
            localStorage.removeItem('denizRotaRoutes');
        }

    } catch (error) {
        console.error('Veri taşıma hatası:', error);
    }
}

// ===== Helper: Get trips (Firestore veya LocalStorage) =====
function getTripsData() {
    if (currentUser && window._firestoreTrips) {
        return window._firestoreTrips;
    }
    return JSON.parse(localStorage.getItem('denizRotaTrips') || '[]');
}

// ===== Helper: Get routes (Firestore veya LocalStorage) =====
function getRoutesData() {
    if (currentUser && window._firestoreRoutes) {
        return window._firestoreRoutes;
    }
    return JSON.parse(localStorage.getItem('denizRotaRoutes') || '[]');
}

// Export functions for use in app.js
window.firebaseAuth = {
    initialize: initializeFirebase,
    isConfigured: isFirebaseConfigured,
    signUpWithEmail,
    signInWithEmail,
    signInWithGoogle,
    signOut,
    sendPasswordReset,
    getCurrentUser: () => currentUser,
    isLoggedIn: () => !!currentUser
};

window.firebaseDB = {
    saveSettings: saveSettingsToFirestore,
    loadSettings: loadSettingsFromFirestore,
    saveTrip: saveTripToFirestore,
    loadTrips: loadTripsFromFirestore,
    deleteTrip: deleteTripFromFirestore,
    clearTrips: clearTripsFromFirestore,
    saveRoute: saveRouteToFirestore,
    loadRoutes: loadRoutesFromFirestore,
    deleteRoute: deleteRouteFromFirestore,
    updateRoute: updateRouteInFirestore,
    migrateLocalData: migrateLocalDataToFirestore,
    getTrips: getTripsData,
    getRoutes: getRoutesData
};
