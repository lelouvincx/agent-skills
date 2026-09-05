# Set up and sync an external Holistics Git repository

## Inputs

- `<external-git-link>`: customer's external Git repository URL
- `<directory-name>`: name of the new local directory
- `<branch-name>`: branch currently selected in Holistics
- `<region>`: Holistics region, such as `eu`

## Set up and sync the repository

1. Sign in to the correct Holistics region:

   ```bash
   holistics auth <region>
   ```

2. Create and enter an empty local directory:

   ```bash
   mkdir <directory-name>
   cd <directory-name>
   ```

3. Initialise an empty Git repository:

   ```bash
   git init
   git branch -m master
   ```

4. Add the customer's external Git repository:

   ```bash
   git remote add origin <external-git-link>
   ```

5. Create the branch currently selected in Holistics:

   ```bash
   git checkout -b <branch-name>
   ```

6. Create an empty initial commit:

   ```bash
   git commit --allow-empty -m "Initial empty commit"
   ```

7. Download the Holistics project into the current directory:

   ```bash
   holistics sync-code .
   ```
