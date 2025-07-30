read -p "Do you want to be an operator or a user? (Enter 'operator' or 'user'): " role

yarn

cd contract

yarn build
yarn compact

cd ..

cd bridge-cli

if [ "$role" = "operator" ]; then
    yarn testnet-remote-operator
elif [ "$role" = "user" ]; then
    yarn testnet-remote
else
  echo "Invalid input. Please enter 'operator' or 'user'."
fi
