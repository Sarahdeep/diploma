import React from 'react';
import { Link } from 'react-router-dom';

const NotFoundPage: React.FC = () => {
  return (
    <div style={{ textAlign: 'center', marginTop: '50px' }}>
      <h1>404 - Page Not Found</h1>
      <p>Sorry, the page you are looking for does not exist.</p>
      <Link to="/">
        <button style={{ padding: '10px 20px', marginTop: '20px', cursor: 'pointer' }}>
          Go to Homepage
        </button>
      </Link>
    </div>
  );
};

export default NotFoundPage;
