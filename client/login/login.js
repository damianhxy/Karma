window.addEventListener('load', () => {
  $register = document.getElementById('register');
  $username = document.getElementById('username');
  $password = document.getElementById('password');
  $register.addEventListener('click', () => {
    const res = await fetch('users/signup', {
      method: 'post',
      body: JSON.stringify({
        username: $username.innerHTML,
        password: $password.innerHTML
      }),
      headers: new Headers({
        'Content-Type': 'application/json',
      }),
    }).then(res => res.json());
    // Handle response from server: registration fail or success?
  });
});