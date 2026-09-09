const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const db = require('./schema');

function seedDatabase() {
  const existingUsers = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (existingUsers.count > 0) {
    console.log('Database already seeded.');
    return;
  }

  console.log('Seeding database with demo data...');

  // Create departments
  const departments = [
    { id: uuidv4(), name: 'Engineering' },
    { id: uuidv4(), name: 'Marketing' },
    { id: uuidv4(), name: 'Sales' },
    { id: uuidv4(), name: 'HR' },
    { id: uuidv4(), name: 'Finance' },
  ];

  const insertDept = db.prepare('INSERT INTO departments (id, name) VALUES (?, ?)');
  departments.forEach(d => insertDept.run(d.id, d.name));

  // Create users
  const passwordHash = bcrypt.hashSync('Password@123', 10);
  const users = [
    {
      id: uuidv4(),
      name: 'Admin User',
      email: 'admin@ghl.internal',
      role: 'admin',
      department_id: departments[3].id, // HR
      designation: 'Platform Administrator',
    },
    {
      id: uuidv4(),
      name: 'Vishnu Kumar',
      email: 'vishnu@ghl.internal',
      role: 'manager',
      department_id: departments[0].id, // Engineering
      designation: 'Fullstack Developer',
    },
    {
      id: uuidv4(),
      name: 'Priya Sharma',
      email: 'priya@ghl.internal',
      role: 'employee',
      department_id: departments[0].id, // Engineering
      designation: 'Frontend Developer',
    },
    {
      id: uuidv4(),
      name: 'Arjun Rajan',
      email: 'arjun@ghl.internal',
      role: 'employee',
      department_id: departments[1].id, // Marketing
      designation: 'Marketing Executive',
    },
    {
      id: uuidv4(),
      name: 'Deepa Nair',
      email: 'deepa@ghl.internal',
      role: 'manager',
      department_id: departments[2].id, // Sales
      designation: 'Sales Manager',
    },
    {
      id: uuidv4(),
      name: 'Karthik Balaji',
      email: 'karthik@ghl.internal',
      role: 'employee',
      department_id: departments[0].id, // Engineering
      designation: 'Backend Developer',
    },
  ];

  const insertUser = db.prepare(`
    INSERT INTO users (id, name, email, password_hash, role, department_id, designation)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  users.forEach(u => insertUser.run(u.id, u.name, u.email, passwordHash, u.role, u.department_id, u.designation));

  // Create a general group conversation
  const generalConvId = uuidv4();
  db.prepare(`
    INSERT INTO conversations (id, type, name, created_by)
    VALUES (?, 'group', 'General', ?)
  `).run(generalConvId, users[0].id);

  const insertMember = db.prepare(`
    INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)
  `);
  users.forEach(u => insertMember.run(generalConvId, u.id));

  // Engineering group
  const engConvId = uuidv4();
  db.prepare(`
    INSERT INTO conversations (id, type, name, created_by)
    VALUES (?, 'group', 'Engineering Team', ?)
  `).run(engConvId, users[1].id);

  [users[1], users[2], users[5]].forEach(u => insertMember.run(engConvId, u.id));

  // Seed some messages in general
  const insertMsg = db.prepare(`
    INSERT INTO messages (id, conversation_id, sender_id, content, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  const now = new Date();
  const msgs = [
    { sender: users[0], content: 'Welcome to GHL Connect! 🎉 This is our new internal communication platform.' },
    { sender: users[1], content: 'Looks great! Really clean UI 👌' },
    { sender: users[2], content: 'Happy to be onboard! @Vishnu Kumar when do we start the next sprint?' },
    { sender: users[3], content: 'Hi everyone from Marketing! 👋' },
    { sender: users[4], content: 'Sales team checking in. Ready to collaborate!' },
  ];

  msgs.forEach((m, i) => {
    const t = new Date(now.getTime() - (msgs.length - i) * 60000);
    insertMsg.run(uuidv4(), generalConvId, m.sender.id, m.content, t.toISOString());
  });

  console.log('✅ Seed data inserted successfully!');
  console.log('\nDemo accounts (password: Password@123):');
  console.log('  Admin:   admin@ghl.internal');
  console.log('  Manager: vishnu@ghl.internal');
  console.log('  Staff:   priya@ghl.internal, arjun@ghl.internal, deepa@ghl.internal, karthik@ghl.internal');
}

module.exports = { seedDatabase };
