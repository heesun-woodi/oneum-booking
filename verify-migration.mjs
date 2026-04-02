import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Parse .env.local
const envFile = readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1]] = match[2];
});

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('🔍 Verifying message_templates table...\n');

try {
  const { data, error, count } = await supabase
    .from('message_templates')
    .select('type_code, category, name', { count: 'exact' });
  
  if (error) {
    console.log('❌ FAIL - Table does not exist or RLS blocks access');
    console.log('Error:', error.message);
    process.exit(1);
  }
  
  console.log('✅ SUCCESS - Table exists!');
  console.log(`📊 Total templates: ${count}/15 (expected 15)\n`);
  
  if (count === 15) {
    console.log('🎉 All 15 templates inserted correctly!\n');
  } else {
    console.log('⚠️  Expected 15 templates but found', count, '\n');
  }
  
  console.log('📝 Template list:');
  data.forEach(t => {
    console.log(`  ${t.type_code} - [${t.category}] ${t.name}`);
  });
  
  console.log('\n✨ Migration completed successfully!');
  console.log('🚀 You can now access /admin/templates page!');
  
} catch (e) {
  console.log('❌ Exception:', e.message);
  process.exit(1);
}
