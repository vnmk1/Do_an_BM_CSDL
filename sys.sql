create user english_web_test identified by 123
grant create session to english_web_test
grant create table to english_web_test
grant create PROCEDURE to english_web_test
alter user english_web_test quota 100M on users
GRANT RESOURCE TO english_web_test;
GRANT CREATE VIEW TO english_web_test;
GRANT EXECUTE ON SYS.DBMS_CRYPTO TO english_web_test;