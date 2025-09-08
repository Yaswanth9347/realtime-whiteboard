// client/src/components/DrawingCanvas/UserList.jsx
import React from 'react';
import './UserList.css';

/**
 * UserList
 * Renders a sidebar or inline list of users currently in the room.
 *
 * Props:
 *  - users: Array<{ id: string, username: string }>
 *  - localUserId: string (optional, to highlight yourself)
 */
const UserList = ({ users = [], localUserId }) => {
  if (!users || users.length === 0) {
    return <div className="user-list empty">No users in room</div>;
  }

  return (
    <div className="user-list">
      <h3 className="user-list-title">Participants ({users.length})</h3>
      <ul>
        {users.map((u) => (
          <li
            key={u.id}
            className={`user-list-item ${
              u.id === localUserId ? 'local-user' : ''
            }`}
          >
            <span className="user-avatar">
              {u.username?.[0]?.toUpperCase() || '?'}
            </span>
            <span className="user-name">
              {u.username || 'Anonymous'}
              {u.id === localUserId && <span className="you-label"> (You)</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default UserList;
