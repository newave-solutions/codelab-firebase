import { inject, Injectable } from '@angular/core';
import {
  Auth,
  authState,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  user,
  getAuth,
  User,
} from '@angular/fire/auth';
import { map, switchMap, firstValueFrom, filter, Observable, Subscription } from 'rxjs';
import {
  doc,
  docData,
  DocumentReference,
  Firestore,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  addDoc,
  deleteDoc,
  collectionData,
  Timestamp,
  serverTimestamp,
  query,
  orderBy,
  limit,
  onSnapshot,
  DocumentData,
  FieldValue,
} from '@angular/fire/firestore';
import {
  Storage,
  getDownloadURL,
  ref,
  uploadBytesResumable,
} from '@angular/fire/storage';
import { getToken, Messaging, onMessage } from '@angular/fire/messaging';
import { Router } from '@angular/router';

type ChatMessage = {
  name: string | null,
  profilePicUrl: string | null,
  timestamp: FieldValue,
  uid: string | null,
  text?: string,
  imageUrl?: string
};


@Injectable({
  providedIn: 'root',
})
export class ChatService {
  firestore: Firestore = inject(Firestore);
  auth: Auth = inject(Auth);
  storage: Storage = inject(Storage);
  messaging: Messaging = inject(Messaging);
  router: Router = inject(Router);
  private provider = new GoogleAuthProvider();
  LOADING_IMAGE_URL = 'https://www.google.com/images/spin-32.gif?a';

  // observable that is updated when the auth state changes
  user$ = user(this.auth);
  currentUser: User | null = this.auth.currentUser;
  userSubscription: Subscription;
  
  constructor() {
    this.userSubscription = this.user$.subscribe((aUser: User | null) => {
        this.currentUser = aUser;
    });
  }

// Signs-in Friendly Chat.
login() {
    signInWithPopup(this.auth, this.provider).then((result) => {
        const credential = GoogleAuthProvider.credentialFromResult(result);
        this.router.navigate(['/', 'chat']);
        return credential;
    }).catch((error) => {
      console.error('Login Error:', error);
    })
}
// Logout of Friendly Chat.
logout() {
    signOut(this.auth).then(() => {
        this.router.navigate(['/', 'login'])
        console.log('signed out');
    }).catch((error) => {
        console.log('sign out error: ' + error);
    })
}
  // Adds a text or image message to Cloud Firestore.
  addMessage = async (
    textMessage: string | null,
    imageUrl: string | null
  ): Promise<void | DocumentReference<DocumentData>> => {
    if (!this.currentUser) {
      throw new Error('User not logged in');
    }
    try {
      // 1. Add a new message entry to the Firebase database.
      const message: ChatMessage = {
        name: this.currentUser.displayName,
        profilePicUrl: this.currentUser.photoURL,
        timestamp: serverTimestamp(),
        uid: this.currentUser.uid,
      };

      if (textMessage && textMessage.length > 0) {
        message.text = textMessage;
      } else if (imageUrl && imageUrl.length > 0) {
        message.imageUrl = imageUrl;
      } else {
        throw new Error('Message must have text or an image');
      }
      return await addDoc(collection(this.firestore, 'messages'), message);
    } catch (error) {
      console.error('Error writing new message to Firebase Database', error);
      throw error;
    }
  };

  // Saves a new message to Cloud Firestore.
  saveTextMessage = async (messageText: string) => {
    return this.addMessage(messageText, null);
  };

  // Loads chat messages history and listens for upcoming ones.
  loadMessages = () => {
    // Create the query to load the last 12 messages and listen for new ones.
    const recentMessagesQuery = query(
      collection(this.firestore, 'messages'),
      orderBy('timestamp', 'desc'),
      limit(12)
    );
    // Start listening to the query.
    return collectionData(recentMessagesQuery, { idField: 'id' });
  };

  // Saves a new message containing an image in Firebase.
  // This first saves the image in Firebase storage.
  saveImageMessage = async (file: any) => {
    try {
      if (!this.currentUser) {
        throw new Error('User not logged in');
      }
      // 1. Upload the image to Cloud Storage.
      const filePath = `${this.currentUser.uid}/${file.name}`;
      const newImageRef = ref(this.storage, filePath);
      const fileSnapshot = await uploadBytesResumable(newImageRef, file);

      // 2. Generate a public URL for the file.
      const publicImageUrl = await getDownloadURL(newImageRef);

      // 3. Add a new message entry to the Firebase database.
      await this.addMessage(null, publicImageUrl);
    } catch (error) {
      console.error(
        'There was an error uploading a file to Cloud Storage:',
        error
      );
    }
  };

  async updateData(path: string, data: any) {}

  async deleteData(path: string) {}

  getDocData(path: string) {}

  getCollectionData(path: string) {}

  async uploadToStorage(
    path: string,
    input: HTMLInputElement,
    contentType: any
  ) {
    return null;
  }
  // Requests permissions to show notifications.
  requestNotificationsPermissions = async () => {
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        await this.saveMessagingDeviceToken();
      }
    } catch (error) {
      console.error('Unable to get permission to notify.', error);
    }
  };

  saveMessagingDeviceToken = async () => {
    try {
      if (!this.currentUser) {
        return;
      }
      const fcmToken = await getToken(this.messaging);
      if (fcmToken) {
        console.log('Got FCM device token:', fcmToken);
        const tokenRef = doc(this.firestore, 'fcmTokens', this.currentUser.uid);
        await setDoc(tokenRef, { token: fcmToken });
      }
    } catch (error) {
      console.error('Unable to get messaging token.', error);
    }
  };
}
