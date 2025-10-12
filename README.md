#  Softflix
---
##  Team members 
- **Ignacio de Diego Valera**  
  -  Mail: i.dediego@alumnos.urjc.es  
  -  GitHub: [@Ignacioddv](https://github.com/Ignacioddv)
- **Samuel Jesús Gómez Martín**  
  -  Mail: sj.gomez.2024@alumnos.urjc.es  
  -  GitHub: [@samugm0](https://github.com/samugm0)
- **Raúl García Piedra**  
  -  Mail: r.garciapi.2024@alumnos.urjc.es  
  -  GitHub: [@Raulgrp7](https://github.com/Raulgrp7)
##  Functionality
- In this web site we will have a catalog of different films with all the  needed and intuitive information through images, also counting with another part that helps  in the searching of the films and an extra web page that contains more information of each film.
###  Entities
- **Main Entity: Films**  
  - Attributes: 
    - `Image`  
    - `Name`  
    - `Prize`
    - `Information`
    - `Rating (1-5)`
    - `Genres (Action, Adventure, Comedy, Science Fiction, Horror, Fantasy)`
    - `Rating_by_age`
    - `Languages (Spanish, English, French, German)`

- **Secondary Entity: User Reviews**  
  - Attributes:   
    - `user_image`  
    - `user_name`
    - `review`
    - `rating (1-5)`
    - `User_image`  
    - `User_name`
    - `Review`
    - `Rating (1-5)`

---

###  Images
- Main entity: associated with an image.  
- Secondary entity: associated with an image.  
---
###  Search, filtering or categorization
- Type of actions that can be made:  
  - Search by movie name.  
  - Filter by movie genre.  
  - Rank according to the score of each movie.
  - Filter by age rating.
