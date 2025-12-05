-- Create the wallet_batches table
CREATE TABLE IF NOT EXISTS wallet_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  wallet_count INTEGER NOT NULL,
  wallet_data JSONB NOT NULL,
  total_mints INTEGER DEFAULT 0,
  total_funded TEXT DEFAULT '0',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create an index on created_at for faster queries
CREATE INDEX IF NOT EXISTS idx_wallet_batches_created_at ON wallet_batches(created_at DESC);

-- Enable Row Level Security
ALTER TABLE wallet_batches ENABLE ROW LEVEL SECURITY;

-- Create a policy to allow all operations (you can restrict this later)
CREATE POLICY "Allow all operations on wallet_batches" ON wallet_batches
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add a trigger to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_wallet_batches_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER wallet_batches_update_timestamp
BEFORE UPDATE ON wallet_batches
FOR EACH ROW
EXECUTE FUNCTION update_wallet_batches_timestamp();
