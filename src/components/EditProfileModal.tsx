import React, { useState, useEffect } from 'react';
import { api } from '../../convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
import { toast } from 'react-hot-toast';
import { Id } from '../../convex/_generated/dataModel';

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  userData?: any;
  worldId?: Id<'worlds'>;
}

// avatar options
const avatarOptions = [
  { path: "/assets/f1.png", name: "Avatar 1" },
  { path: "/assets/f3.png", name: "Avatar 2" },
  { path: "/assets/f4.png", name: "Avatar 3" },
  { path: "/assets/f5.png", name: "Avatar 4" },
  { path: "/assets/f6.png", name: "Avatar 5" },
  { path: "/assets/f7.png", name: "Avatar 6" },
  { path: "/assets/f8.png", name: "Avatar 7" },
];

const EditProfileModal: React.FC<EditProfileModalProps> = ({ 
  isOpen, 
  onClose, 
  userData,
  worldId 
}) => {
  const [name, setName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [selectedAvatar, setSelectedAvatar] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);

  // get edit player mutation
  const sendInput = useMutation(api.world.sendWorldInput);
  
  // get world status to get engineId
  const worldStatus = useQuery(api.world.defaultWorldStatus);

  // when the modal is opened, initialize the form data
  useEffect(() => {
    if (isOpen && userData) {
      setName(userData.name || '');
      setDescription(userData.description || '');
      setSelectedAvatar(userData.avatarPath || '/assets/f1.png');
      console.log('EditProfileModal - userData:', userData);
    }
  }, [isOpen, userData]);

  // handle save
  const handleSave = () => {
    if (!userData?.playerId || !worldId) {
      toast.error("Missing user data or world ID");
      return;
    }

    if (!name.trim()) {
      toast.error("Name cannot be empty");
      return;
    }

    if (!description.trim()) {
      toast.error("Description cannot be empty");
      return;
    }

    if (!selectedAvatar) {
      toast.error("Please select an avatar");
      return;
    }

    // Show confirmation dialog
    setShowConfirmModal(true);
  };

  // handle confirm save
  const handleConfirmSave = async () => {
    setIsLoading(true);

    try {
      if (!worldStatus?.engineId) {
        throw new Error("Cannot get engine ID");
      }

      // use new edit transaction
      const character = selectedAvatar.match(/f(\d+)\.png/)?.[1] || "1";
      
      await sendInput({
        engineId: worldStatus.engineId,
        name: "edit",
        args: {
          playerId: userData.playerId,
          name: name.trim(),
          character: `f${character}`,
          description: description.trim(),
          ethAddress: userData.ethAddress
        }
      });

      console.log('Edited information via edit transaction: ', name, description, selectedAvatar, userData.ethAddress, worldId);

      toast.success("Profile updated successfully!");
      setShowConfirmModal(false);
      onClose();
      // refresh the profile sidebar, temporary solution
      window.location.reload();
    } catch (error) {
      console.error('Failed to update profile:', error);
      toast.error("Failed to update profile. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // handle cancel
  const handleCancel = () => {
    // reset form data
    if (userData) {
      setName(userData.name || '');
      setDescription(userData.description || '');
      setSelectedAvatar(userData.avatarPath || '/assets/f1.png');
    }
    setShowConfirmModal(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Confirmation dialog */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-gray-900 rounded-lg border border-gray-700 shadow-lg w-11/12 max-w-md p-6">
            <div className="text-center">
              <h3 className="text-white text-lg font-medium mb-4">Confirm Changes</h3>
              <p className="text-gray-300 mb-6">Are you sure you want to update your character's name, description, and avatar? All fields are required. The window will refresh.</p>
              <div className="flex justify-center space-x-4">
                <button
                  onClick={() => setShowConfirmModal(false)}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-md text-sm transition-colors"
                  disabled={isLoading}
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmSave}
                  disabled={isLoading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                  {isLoading ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Saving...
                    </>
                  ) : (
                    'Confirm'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
        <div className="bg-gray-900 rounded-lg border border-gray-700 shadow-lg w-11/12 max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-700 flex justify-between items-center">
          <h2 className="text-white text-xl font-medium">Edit Profile</h2>
          <button 
            onClick={handleCancel}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* Content */}
        <div className="p-6 overflow-y-auto flex-grow">
          <div className="space-y-6">
            {/* Avatar Selection */}
            <div>
              <h3 className="text-white text-lg font-medium mb-3">
                Avatar <span className="text-red-400">*</span>
              </h3>
              <div className="grid grid-cols-4 gap-3">
                {avatarOptions.map((avatar, index) => (
                  <div
                    key={index}
                    className={`relative cursor-pointer rounded-lg p-2 transition-all ${
                      selectedAvatar === avatar.path 
                        ? 'bg-blue-600 border-2 border-blue-400' 
                        : 'bg-gray-800 border-2 border-transparent hover:border-gray-600'
                    }`}
                    onClick={() => setSelectedAvatar(avatar.path)}
                  >
                    <img
                      src={avatar.path}
                      alt={avatar.name}
                      className="w-full h-16 object-cover rounded"
                    />
                    {selectedAvatar === avatar.path && (
                      <div className="absolute top-1 right-1 bg-blue-500 rounded-full p-1">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Display Name */}
            <div>
              <label htmlFor="name" className="block text-white text-sm font-medium mb-2">
                Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter your new name"
                maxLength={10}
              />
              <p className="text-xs text-gray-400 mt-1">
                {name.length}/10 characters
              </p>
            </div>

            {/* Description */}
            <div>
              <label htmlFor="description" className="block text-white text-sm font-medium mb-2">
                Description <span className="text-red-400">*</span>
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                placeholder="Enter your character description"
                rows={3}
                maxLength={200}
              />
              <p className="text-xs text-gray-400 mt-1">
                {description.length}/200 characters
              </p>
            </div>

          </div>
        </div>
        
        {/* Footer */}
        <div className="p-4 border-t border-gray-700 flex justify-end space-x-3">
          <button 
            onClick={handleCancel}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-md text-sm transition-colors"
            disabled={isLoading}
          >
            Cancel
          </button>
          <button 
            onClick={handleSave}
            disabled={isLoading || !name.trim() || !description.trim() || !selectedAvatar}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </button>
        </div>
      </div>
    </div>
    </>
  );
};

export default EditProfileModal;
