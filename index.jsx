import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot, getDoc } from 'firebase/firestore';

// Main App component
const App = () => {
  // Firebase state variables
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Application data states
  const [globalTasks, setGlobalTasks] = useState([]);
  const [dailyTasks, setDailyTasks] = useState({
    monday: [], tuesday: [], wednesday: [], thursday: [],
    friday: [], saturday: [], sunday: []
  });
  const [routines, setRoutines] = useState([]);

  // Confirmation dialog state
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [confirmMessage, setConfirmMessage] = useState('');

  // Initialize Firebase and set up auth listener
  useEffect(() => {
    try {
      // Get the app ID from the Canvas environment, fallback to 'default-app-id' if not defined
      const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
      const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};

      const app = initializeApp(firebaseConfig);
      const firestoreDb = getFirestore(app);
      const firebaseAuth = getAuth(app);

      setDb(firestoreDb);
      setAuth(firebaseAuth);

      const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
        if (user) {
          setUserId(user.uid);
          setIsAuthReady(true);
        } else {
          // Attempt to sign in with custom token if available
          if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            try {
              await signInWithCustomToken(firebaseAuth, __initial_auth_token);
            } catch (authError) {
              console.error("Firebase custom token sign-in failed:", authError);
              // Fallback to anonymous sign-in if custom token fails
              try {
                const anonUser = await signInAnonymously(firebaseAuth);
                setUserId(anonUser.user.uid);
                setIsAuthReady(true);
              } catch (anonError) {
                console.error("Firebase anonymous sign-in failed:", anonError);
                setError("Failed to authenticate. Please try again.");
                setLoading(false);
              }
            }
          } else {
            // Sign in anonymously if no custom token
            try {
              const anonUser = await signInAnonymously(firebaseAuth);
              setUserId(anonUser.user.uid);
              setIsAuthReady(true);
            } catch (anonError) {
              console.error("Firebase anonymous sign-in failed:", anonError);
              setError("Failed to authenticate. Please try again.");
              setLoading(false);
            }
          }
        }
      });
      return () => unsubscribe();
    } catch (e) {
      console.error("Firebase initialization error:", e);
      setError("Failed to initialize the application.");
      setLoading(false);
    }
  }, []);

  // Fetch and listen for data changes
  useEffect(() => {
    if (!db || !isAuthReady || !userId) {
      return;
    }

    // Get the app ID from the Canvas environment
    const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
    // Construct the Firestore document reference using the actual appId
    const docRef = doc(db, `artifacts/${appId}/users/${userId}/tasksAndRoutines`, 'user_data');

    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setGlobalTasks(data.globalTasks || []);
        setDailyTasks(data.dailyTasks || {
          monday: [], tuesday: [], wednesday: [], thursday: [],
          friday: [], saturday: [], sunday: []
        });
        setRoutines(data.routines || []);
      } else {
        // Initialize with empty data if document doesn't exist
        const initialData = {
          globalTasks: [],
          dailyTasks: {
            monday: [], tuesday: [], wednesday: [], thursday: [],
            friday: [], saturday: [], sunday: []
          },
          routines: []
        };
        setDoc(docRef, initialData).catch(e => console.error("Error setting initial document:", e));
      }
      setLoading(false);
    }, (e) => {
      console.error("Error fetching data from Firestore:", e);
      setError("Failed to load data. Please check your connection.");
      setLoading(false);
    });

    return () => unsubscribe();
  }, [db, isAuthReady, userId]);

  // Function to save data to Firestore
  const saveData = useCallback(async (newGlobalTasks, newDailyTasks, newRoutines) => {
    if (!db || !userId) {
      console.warn("Firestore not ready or user not authenticated. Cannot save data.");
      return;
    }
    // Get the app ID from the Canvas environment
    const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
    // Construct the Firestore document reference using the actual appId
    const docRef = doc(db, `artifacts/${appId}/users/${userId}/tasksAndRoutines`, 'user_data');
    try {
      await setDoc(docRef, {
        globalTasks: newGlobalTasks,
        dailyTasks: newDailyTasks,
        routines: newRoutines
      });
    } catch (e) {
      console.error("Error saving data to Firestore:", e);
      setError("Failed to save data. Please try again.");
    }
  }, [db, userId]);

  // Handlers for Global Tasks
  const addGlobalTask = (text) => {
    const newTasks = [...globalTasks, { id: Date.now().toString(), text, completed: false }];
    setGlobalTasks(newTasks);
    saveData(newTasks, dailyTasks, routines);
  };

  const toggleGlobalTaskCompletion = (id) => {
    const newTasks = globalTasks.map(task =>
      task.id === id ? { ...task, completed: !task.completed } : task
    );
    setGlobalTasks(newTasks);
    saveData(newTasks, dailyTasks, routines);
  };

  const deleteGlobalTask = (id) => {
    const newTasks = globalTasks.filter(task => task.id !== id);
    setGlobalTasks(newTasks);
    saveData(newTasks, dailyTasks, routines);
  };

  // Handlers for Daily Tasks
  const addDailyTask = (day, text) => {
    const newDailyTasks = {
      ...dailyTasks,
      [day]: [...dailyTasks[day], { id: Date.now().toString(), text, completed: false }]
    };
    setDailyTasks(newDailyTasks);
    saveData(globalTasks, newDailyTasks, routines);
  };

  const toggleDailyTaskCompletion = (day, id) => {
    const newDailyTasks = {
      ...dailyTasks,
      [day]: dailyTasks[day].map(task =>
        task.id === id ? { ...task, completed: !task.completed } : task
      )
    };
    setDailyTasks(newDailyTasks);
    saveData(globalTasks, newDailyTasks, routines);
  };

  const deleteDailyTask = (day, id) => {
    const newDailyTasks = {
      ...dailyTasks,
      [day]: dailyTasks[day].filter(task => task.id !== id)
    };
    setDailyTasks(newDailyTasks);
    saveData(globalTasks, newDailyTasks, routines);
  };

  // Handlers for Routines
  const addRoutine = (text) => {
    const newRoutines = [...routines, {
      id: Date.now().toString(),
      text,
      completion: {
        monday: false, tuesday: false, wednesday: false, thursday: false,
        friday: false, saturday: false, sunday: false
      }
    }];
    setRoutines(newRoutines);
    saveData(globalTasks, dailyTasks, newRoutines);
  };

  const toggleRoutineCompletion = (routineId, day) => {
    const newRoutines = routines.map(routine =>
      routine.id === routineId
        ? { ...routine, completion: { ...routine.completion, [day]: !routine.completion[day] } }
        : routine
    );
    setRoutines(newRoutines);
    saveData(globalTasks, dailyTasks, newRoutines);
  };

  const deleteRoutine = (id) => {
    const newRoutines = routines.filter(routine => routine.id !== id);
    setRoutines(newRoutines);
    saveData(globalTasks, dailyTasks, newRoutines);
  };

  // Reset all data function
  const handleResetAll = () => {
    setConfirmMessage("Êtes-vous sûr de vouloir tout effacer ? Cette action est irréversible.");
    setConfirmAction(() => async () => {
      const emptyData = {
        globalTasks: [],
        dailyTasks: {
          monday: [], tuesday: [], wednesday: [], thursday: [],
          friday: [], saturday: [], sunday: []
        },
        routines: []
      };
      setGlobalTasks(emptyData.globalTasks);
      setDailyTasks(emptyData.dailyTasks);
      setRoutines(emptyData.routines);
      await saveData(emptyData.globalTasks, emptyData.dailyTasks, emptyData.routines);
      setShowConfirm(false);
    });
    setShowConfirm(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-gray-100 flex items-center justify-center p-4">
        <div className="text-xl font-semibold">Chargement de l'application...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 text-red-400 flex items-center justify-center p-4 text-center">
        <div className="text-xl font-semibold">Erreur: {error}</div>
      </div>
    );
  }

  // Common input field component
  const TaskInput = ({ onAddTask, placeholder }) => {
    const [taskText, setTaskText] = useState('');
    const handleKeyPress = (e) => {
      if (e.key === 'Enter' && taskText.trim()) {
        onAddTask(taskText.trim());
        setTaskText('');
      }
    };
    return (
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          className="flex-grow p-2 rounded-lg bg-gray-700 text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder={placeholder}
          value={taskText}
          onChange={(e) => setTaskText(e.target.value)}
          onKeyPress={handleKeyPress}
        />
        <button
          onClick={() => {
            if (taskText.trim()) {
              onAddTask(taskText.trim());
              setTaskText('');
            }
          }}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-md transition duration-200"
        >
          Ajouter
        </button>
      </div>
    );
  };

  // Common task list item component
  const TaskItem = ({ task, onToggle, onDelete }) => (
    <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg shadow-sm mb-2">
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={task.completed}
          onChange={() => onToggle(task.id)}
          className="form-checkbox h-5 w-5 text-blue-500 rounded focus:ring-blue-500 bg-gray-700 border-gray-600"
        />
        <span className={`text-lg ${task.completed ? 'line-through text-gray-400' : 'text-gray-100'}`}>
          {task.text}
        </span>
      </div>
      <button
        onClick={() => onDelete(task.id)}
        className="text-red-500 hover:text-red-600 transition duration-200 p-1 rounded-full hover:bg-gray-700"
        aria-label="Supprimer la tâche"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm6 0a1 1 0 11-2 0v6a1 1 0 112 0V8z" clipRule="evenodd" />
        </svg>
      </button>
    </div>
  );

  // Component for Global Weekly Tasks
  const WeeklyTasks = () => (
    <div className="bg-gray-800 p-6 rounded-xl shadow-lg h-full flex flex-col">
      <h2 className="text-2xl font-bold text-blue-400 mb-4 pb-2 border-b border-gray-700">Tâches Globales de la Semaine</h2>
      <TaskInput onAddTask={addGlobalTask} placeholder="Ajouter une tâche globale..." />
      <div className="flex-grow overflow-y-auto custom-scrollbar">
        {globalTasks.length === 0 ? (
          <p className="text-gray-400">Aucune tâche globale pour le moment.</p>
        ) : (
          globalTasks.map(task => (
            <TaskItem
              key={task.id}
              task={task}
              onToggle={toggleGlobalTaskCompletion}
              onDelete={deleteGlobalTask}
            />
          ))
        )}
      </div>
    </div>
  );

  // Component for Daily Tasks
  const DailyTasks = ({ day, tasks, onAddTask, onToggleTask, onDeleteTask }) => {
    const dayNames = {
      monday: "Lundi", tuesday: "Mardi", wednesday: "Mercredi",
      thursday: "Jeudi", friday: "Vendredi", saturday: "Samedi", sunday: "Dimanche"
    };
    return (
      <div className="bg-gray-800 p-6 rounded-xl shadow-lg h-full flex flex-col">
        <h3 className="text-xl font-bold text-green-400 mb-3 pb-2 border-b border-gray-700">{dayNames[day]}</h3>
        <TaskInput onAddTask={(text) => onAddTask(day, text)} placeholder={`Ajouter une tâche pour ${dayNames[day].toLowerCase()}...`} />
        <div className="flex-grow overflow-y-auto custom-scrollbar">
          {tasks.length === 0 ? (
            <p className="text-gray-400">Aucune tâche pour ${dayNames[day].toLowerCase()}.</p>
          ) : (
            tasks.map(task => (
              <TaskItem
                key={task.id}
                task={task}
                onToggle={id => onToggleTask(day, id)}
                onDelete={id => onDeleteTask(day, id)}
              />
            ))
          )}
        </div>
      </div>
    );
  };

  // Component for Routine Tracker
  const RoutineTracker = () => {
    const daysOfWeek = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const dayLabels = {
      monday: "Lun", tuesday: "Mar", wednesday: "Mer",
      thursday: "Jeu", friday: "Ven", saturday: "Sam", sunday: "Dim"
    };

    return (
      <div className="bg-gray-800 p-6 rounded-xl shadow-lg h-full flex flex-col">
        <h2 className="text-2xl font-bold text-purple-400 mb-4 pb-2 border-b border-gray-700">Suivi de Routine</h2>
        <TaskInput onAddTask={addRoutine} placeholder="Ajouter une routine..." />
        <div className="flex-grow overflow-x-auto custom-scrollbar">
          {routines.length === 0 ? (
            <p className="text-gray-400">Aucune routine pour le moment.</p>
          ) : (
            <table className="w-full text-left table-auto">
              <thead>
                <tr className="bg-gray-700 text-gray-300">
                  <th className="p-3 font-semibold rounded-tl-lg">Routine</th>
                  {daysOfWeek.map(day => (
                    <th key={day} className="p-3 font-semibold text-center">{dayLabels[day]}</th>
                  ))}
                  <th className="p-3 font-semibold rounded-tr-lg">Actions</th>
                </tr>
              </thead>
              <tbody>
                {routines.map(routine => (
                  <tr key={routine.id} className="border-b border-gray-700 hover:bg-gray-700 transition duration-150">
                    <td className="p-3 text-gray-100">{routine.text}</td>
                    {daysOfWeek.map(day => (
                      <td key={`${routine.id}-${day}`} className="p-3 text-center">
                        <input
                          type="checkbox"
                          checked={routine.completion[day]}
                          onChange={() => toggleRoutineCompletion(routine.id, day)}
                          className="form-checkbox h-5 w-5 text-purple-500 rounded focus:ring-purple-500 bg-gray-700 border-gray-600"
                        />
                      </td>
                    ))}
                    <td className="p-3 text-center">
                      <button
                        onClick={() => deleteRoutine(routine.id)}
                        className="text-red-500 hover:text-red-600 transition duration-200 p-1 rounded-full hover:bg-gray-700"
                        aria-label="Supprimer la routine"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm6 0a1 1 0 11-2 0v6a1 1 0 112 0V8z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  };

  // Confirmation Dialog Component
  const ConfirmDialog = ({ message, onConfirm, onCancel, show }) => {
    if (!show) return null;
    return (
      <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
        <div className="bg-gray-800 p-6 rounded-xl shadow-2xl text-center max-w-sm w-full border border-gray-700">
          <p className="text-gray-100 text-lg mb-6">{message}</p>
          <div className="flex justify-center gap-4">
            <button
              onClick={onConfirm}
              className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg shadow-md transition duration-200 transform hover:scale-105"
            >
              Confirmer
            </button>
            <button
              onClick={onCancel}
              className="px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg shadow-md transition duration-200 transform hover:scale-105"
            >
              Annuler
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-4 sm:p-6 font-inter relative">
      <style>
        {`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap');
        body { font-family: 'Inter', sans-serif; }
        .custom-scrollbar::-webkit-scrollbar {
            width: 8px;
            height: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
            background: #2d3748; /* gray-800 */
            border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
            background: #4a5568; /* gray-600 */
            border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
            background: #6b7280; /* gray-500 */
        }
        `}
      </style>
      <script src="https://cdn.tailwindcss.com"></script>

      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6 mb-8">
        <div className="md:col-span-1 lg:col-span-1">
          {userId && (
            <div className="bg-gray-800 p-4 rounded-xl shadow-lg mb-4 text-sm text-gray-400">
              ID Utilisateur: <span className="font-mono break-all">{userId}</span>
            </div>
          )}
          <WeeklyTasks />
        </div>

        <div className="md:col-span-2 lg:col-span-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(day => (
            <DailyTasks
              key={day}
              day={day}
              tasks={dailyTasks[day]}
              onAddTask={addDailyTask}
              onToggleTask={toggleDailyTaskCompletion}
              onDeleteTask={deleteDailyTask}
            />
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto mb-8">
        <RoutineTracker />
      </div>

      <div className="max-w-7xl mx-auto text-center mt-8">
        <button
          onClick={handleResetAll}
          className="px-8 py-4 bg-red-700 hover:bg-red-800 text-white font-bold rounded-xl shadow-lg transition duration-300 transform hover:scale-105 active:scale-95 focus:outline-none focus:ring-4 focus:ring-red-500/50"
        >
          Réinitialiser tout
        </button>
      </div>

      <ConfirmDialog
        message={confirmMessage}
        onConfirm={confirmAction}
        onCancel={() => setShowConfirm(false)}
        show={showConfirm}
      />
    </div>
  );
};

export default App;
