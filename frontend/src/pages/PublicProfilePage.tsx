import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Observation } from '@/lib/types'; // Assuming you have this type
import { apiClient } from '@/services/apiClient'; // Corrected import path
import { ObservationTable } from '@/components/ObservationTable'; // Corrected import
import { format } from 'date-fns';
import { Species } from '@/lib/types'; // Import Species type

interface PublicUserProfileData {
  id: number;
  username: string;
  avatar_url: string | null;
  created_at: string; // Assuming ISO string
  observation_count: number;
  last_observation_date: string | null; // Assuming ISO string
  bio: string | null;
  location: string | null;
  website: string | null;
  social_links: Record<string, string> | null;
  role: string; // or a specific enum/type if available
}

const PublicProfilePage: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const [profile, setProfile] = useState<PublicUserProfileData | null>(null);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingObservations, setLoadingObservations] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [speciesList, setSpeciesList] = useState<Species[]>([]); // Add state for speciesList
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const OBSERVATIONS_PER_PAGE = 10;

  // Moved fetchObservations outside of useEffect
  const fetchObservations = useCallback(async (pageToFetch: number) => {
    if (!userId) return;
    setLoadingObservations(true);
    try {
      const skip = (pageToFetch - 1) * OBSERVATIONS_PER_PAGE;
      const response = await apiClient.get<{ observations: Observation[], total_count: number }>(`/users/${userId}/observations?skip=${skip}&limit=${OBSERVATIONS_PER_PAGE}`);
      setObservations(response.data.observations);
      setTotalPages(Math.ceil(response.data.total_count / OBSERVATIONS_PER_PAGE));
      setCurrentPage(pageToFetch); // Set current page after successful fetch
    } catch (err) {
      console.error("Failed to fetch user observations:", err);
      // Non-critical error, profile can still be shown
    } finally {
      setLoadingObservations(false);
    }
  }, [userId, OBSERVATIONS_PER_PAGE, setLoadingObservations, setObservations, setTotalPages, setCurrentPage]); // Added state setters to dependencies

  useEffect(() => {
    if (userId) {
      const fetchProfile = async () => {
        setLoadingProfile(true);
        try {
          const response = await apiClient.get<PublicUserProfileData>(`/users/${userId}/profile`);
          setProfile(response.data);
          setError(null);
        } catch (err) {
          console.error("Failed to fetch public profile:", err);
          setError("Failed to load profile. The user may not exist or there was a network error.");
        } finally {
          setLoadingProfile(false);
        }
      };

      // fetchObservations is now defined outside this useEffect

      // Fetch species list (mock or from API if needed for display purposes, though not for editing in readOnly)
      const fetchSpecies = async () => {
        try {
          // Example: const speciesResponse = await apiClient.get<Species[]>('/api/species');
          // setSpeciesList(speciesResponse.data);
          setSpeciesList([]); // Assuming species data is part of ObservationRead and not strictly needed for readOnly
        } catch (err) {
          console.error("Failed to fetch species list:", err);
        }
      };

      fetchProfile();
      fetchObservations(1); // Fetch initial page (page 1)
      fetchSpecies(); // Call fetchSpecies
    }
  }, [userId, fetchObservations]); // fetchObservations is now a stable callback from outside

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      fetchObservations(newPage);
    }
  };

  if (loadingProfile) {
    return <div className="container mx-auto p-4">Loading profile...</div>;
  }

  if (error) {
    return <div className="container mx-auto p-4 text-red-500">{error}</div>;
  }

  if (!profile) {
    return <div className="container mx-auto p-4">User not found.</div>;
  }

  return (
    <div className="container mx-auto p-4 space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center space-x-4">
          <Avatar className="h-24 w-24">
            <AvatarImage src={profile.avatar_url || undefined} alt={profile.username} />
            <AvatarFallback>{profile.username.charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div>
            <CardTitle className="text-3xl">{profile.username}</CardTitle>
            <p className="text-muted-foreground">
              Joined on {format(new Date(profile.created_at), 'MMMM d, yyyy')}
            </p>
            {profile.location && <p className="text-sm text-muted-foreground">Location: {profile.location}</p>}
          </div>
        </CardHeader>
        <CardContent>
          {profile.bio && <p className="mb-4">{profile.bio}</p>}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="font-semibold">Observations: </span>
              {profile.observation_count}
            </div>
            {profile.last_observation_date && (
              <div>
                <span className="font-semibold">Last Observation: </span>
                {format(new Date(profile.last_observation_date), 'PPpp')}
              </div>
            )}
            {profile.website && (
              <div>
                <span className="font-semibold">Website: </span>
                <a href={profile.website} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                  {profile.website}
                </a>
              </div>
            )}
          </div>
          {/* Consider showing social links if they exist and are meant to be public */}
        </CardContent>
      </Card>

      <Tabs defaultValue="observations">
        <TabsList>
          <TabsTrigger value="observations">Observations ({profile.observation_count})</TabsTrigger>
          {/* Add other tabs if needed, e.g., Activity, Stats - if they are public */}
        </TabsList>
        <TabsContent value="observations">
          {loadingObservations ? (
            <p>Loading observations...</p>
          ) : observations.length > 0 ? (
            <ObservationTable
              observations={observations}
              speciesList={speciesList} // Provide speciesList
              isLoading={loadingObservations}
              currentPage={currentPage} 
              totalPages={totalPages} 
              onPageChange={handlePageChange} 
              onEdit={() => {}} // Mocked for readOnly
              onDelete={() => {}} // Mocked for readOnly
              readOnly={true}
            />
          ) : (
            <p>This user has not made any observations yet.</p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PublicProfilePage; 