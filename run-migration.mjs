import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Parse .env.local
const envFile = readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1]] = match[2];
});

// Read migration SQL
const sql = readFileSync('supabase/migrations/005_message_templates.sql', 'utf8');

console.log('🚀 Running migration: 005_message_templates.sql\n');
console.log('⚠️  Note: This uses ANON key, so it might fail if RLS blocks CREATE TABLE.');
console.log('   If it fails, you need to run this in Supabase Dashboard SQL Editor.\n');

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

try {
  // Try to execute via RPC (if a function exists) or direct query
  // This will likely fail because ANON key can't CREATE TABLE
  const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
  
  if (error) {
    console.log('❌ Failed with ANON key (expected)');
    console.log('Error:', error.message);
    console.log('\n📋 Next steps:');
    console.log('1. Open Supabase Dashboard: https://supabase.com/dashboard/project/yopcycwuadnwrrkfldui/sql');
    console.log('2. Open SQL Editor');
    console.log('3. Paste the contents of: supabase/migrations/005_message_templates.sql');
    console.log('4. Click "Run"');
    console.log('\n✨ The SQL file is safe to run (has IF NOT EXISTS and ON CONFLICT)');
  } else {
    console.log('✅ Migration executed successfully!');
    console.log(data);
  }
} catch (e) {
  console.log('❌ Exception:', e.message);
  console.log('\n📋 Manual execution required:');
  console.log('1. Go to: https://supabase.com/dashboard/project/yopcycwuadnwrrkfldui/sql');
  console.log('2. Copy & paste: supabase/migrations/005_message_templates.sql');
  console.log('3. Run it!');
}
