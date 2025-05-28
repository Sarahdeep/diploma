import React from 'react';
import { Link } from 'react-router-dom';

const HomePage: React.FC = () => {
  return (
    <div>
      <h1>Welcome to the Animal Habitat Service</h1>
      <p>This is the public home page.</p>
      <p><Link to="/observations">View Observations (Example Protected Route)</Link></p>
      <p><Link to="/admin">Admin Dashboard (Example Admin-Only Route)</Link></p>
    </div>
  );
};

export default HomePage; 