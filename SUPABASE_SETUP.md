# Supabase Integration Setup Guide

## Steps to Complete Setup:

### 1. Install Supabase
Run the following command in your terminal:
```bash
npm install @supabase/supabase-js
```

### 2. Configure Supabase Credentials
Update your environment files with Supabase credentials:

**File: `src/environments/environment.ts`**
```typescript
export const environment = {
  production: false,
  supabase: {
    url: 'https://uexbbrhnpjfhibwxbvlx.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVleGJicmhucGpmaGlid3hidmx4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkwMjc2OTIsImV4cCI6MjEwNDYwMzY5Mn0.lePn3kX_yr-SfzM3duyxiHPpvHh3dOjp7NZIgzSQS8E'
  }
};
```

### 3. Get Your Credentials
1. Go to [Supabase Console](https://supabase.com)
2. Create a new project or select existing one
3. Go to Project Settings → API
4. Copy your:
   - Project URL (Your SUPABASE_URL)
   - Anon Key (Your SUPABASE_ANON_KEY)

### 4. Create Database Table
In your Supabase dashboard, run this SQL query:

```sql
CREATE TABLE professors (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  professor_id VARCHAR(50) UNIQUE NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  middle_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  gender VARCHAR(20) NOT NULL,
  age INT NOT NULL,
  password VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 5. Update Supabase Service
Update `src/app/services/supabase.service.ts` with your actual credentials:

```typescript
const SUPABASE_URL = 'https://uexbbrhnpjfhibwxbvlx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVleGJicmhucGpmaGlid3hidmx4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkwMjc2OTIsImV4cCI6MjEwNDYwMzY5Mn0.lePn3kX_yr-SfzM3duyxiHPpvHh3dOjp7NZIgzSQS8E';
```

## Features Implemented:

✅ **Form Validation**
- All fields are required
- Professor ID: minimum 3 characters
- Names: minimum 2 characters
- Age: 18-100 years
- Password: minimum 6 characters
- Gender: dropdown selection

✅ **Error Display**
- Real-time validation feedback
- Error messages below each field
- Red border on invalid fields

✅ **Supabase Integration**
- Register new professors
- Check for duplicate professor IDs
- Database persistence

✅ **User Feedback**
- Toast notifications for success/error
- Loading state during submission
- Clear error messages

## Testing the Form:
1. Try submitting empty form - should show validation errors
2. Fill in all fields correctly - should register successfully
3. Try registering same professor ID twice - should show error

## Additional Notes:
- Password is stored in Supabase (consider hashing in production)
- For production, enable Row Level Security (RLS) on the professors table
- Implement proper authentication (consider Supabase Auth)
